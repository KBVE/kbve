import Phaser from 'phaser';
import {
	GameClient,
	ACTION_SHOOT,
	ACTION_PICKUP,
	attachCameraZoom,
	flashEntity,
	floatingText,
	drawHealthBar,
	type EntityDelta,
	type KindEntry,
	type Snapshot,
	type Welcome,
	type CombatEvent,
	type FloorChangeEvent,
	type Facing,
	type InventorySync,
	type InventoryItem,
	type ItemPlacedEvent,
	type StatusView,
	type StatusKind,
} from '@kbve/laser';
import {
	COLORS,
	TILE_W,
	TILE_H,
	MOVE_TWEEN_MS,
	WALK_SPEED,
	RUN_SPEED,
	SIM_DT_MS,
	ARRIVE_DIST,
	WAYPOINT_REACH,
	HEARTBEAT_MS,
	DEPTH_TILE,
	DEPTH_ENTITY_BASE,
	DEPTH_UI,
	ARROW_MAX_RANGE,
	ARROW_SPEED,
	arpgAsset,
	GROUND_TEXTURE_KEY,
	GROUND_TEXTURE_PATH,
	GRASS_TEXTURE_KEY,
	GRASS_TEXTURE_PATH,
	SURFACE_MAX_Z,
	DUNGEON_SEED,
	DUNGEON_RADIUS,
	DEBUG_LOCAL_PLAYER,
	DEBUG_SPAWN_TILE,
} from './config';
import {
	worldToScreen,
	screenToWorld,
	screenToWorldF,
	tileDepth,
	type TileXY,
} from './iso';
import { CursorController, Cursor } from './input/cursor';
import {
	makeFogState,
	buildFog,
	syncFogToZoom,
	type FogState,
} from './systems/fog';
import {
	makeHudState,
	tickHud,
	resetHudMap,
	type HudState,
} from './systems/hudEmit';
import { EntityStore } from '@kbve/laser';
import { makeKindResolvers, type KindResolvers } from './systems/kindResolvers';
import {
	applyEntitySync,
	type SyncBridge,
	type SyncResolvers,
	type SyncState,
} from './systems/netSync';
import {
	makeFloatState,
	stepFloat,
	floatTile,
	reconcileFloat,
	type FloatState,
} from './systems/floatMotion';
import {
	DungeonField,
	floorSeed,
	chunkOf,
	chunkGate,
	chunkPassageWidth,
	CHUNK_SIZE,
	StairKind,
	stairTile,
} from './systems/dungeon';
import { preloadStairs } from './entities/stairs';
import {
	makeDungeonView,
	refreshDungeonView,
	rebuildDungeonView,
	placeStairs as placeStairsView,
	type DungeonView,
} from './systems/dungeonView';
import { findHierPath, type GateGraph } from './systems/pathfind';
import { fireBow, showDamage, type BowShot } from './combat/bow';
import {
	clearHud,
	emitInventory,
	emitInventoryOpen,
	emitSpellLoadout,
	onInventoryIntent,
	type InventoryIntent,
} from './systems/hud';
import { loadSpellMeta, type SpellMeta } from './entities/spellMeta';

// How far (tiles) a hostile's center may sit off the aim line and still be hit
// by the arrow — the thick-ray half-width. Bigger = more forgiving aim.
const BOW_ACQUIRE_PERP = 0.85;
// How long a corpse (a monster the arrow just killed) plays its death before it
// is torn down.
const CORPSE_FADE_MS = 900;
import { facingDegFromDelta } from './entities/classes';
import {
	makeSprite,
	makeClassSprite,
	makeCreatureSprite,
	makeNameplate,
	setClassPose,
	setCreaturePose,
	tickClassFacing,
	tickCreatureFacing,
	isPlayerKind,
	type EntityRefs,
} from './entities/sprites';
import {
	preloadClass,
	registerClassAnims,
	RANGER_CLASS,
} from './entities/classes';
import {
	preloadCreature,
	registerCreatureAnims,
	resolveCreature,
	APEX_PREDATOR,
	DEBUG_CREATURE_DIRS,
} from './entities/creatures';
import {
	newInterp,
	pushSample,
	resetInterp,
	sampleAt,
	INTERP_DELAY_MS,
} from './systems/interp';
import {
	preloadEnv,
	registerEnvAnims,
	makeEnvSprite,
	ENV_REGISTRY,
} from './entities/env';
import { getNetConfig } from './net-config';
import { resolvePlayerName } from './playerName';

const LOCAL_PLAYER_EID = 1;
const LOCAL_PLAYER_KIND = 1;
// Status effect aura/pip colours and the aura precedence (harm before help).
const STATUS_COLOR: Record<StatusKind, number> = {
	Burn: 0xfb923c,
	Poison: 0x84cc16,
	Regen: 0x4ade80,
	Haste: 0x38bdf8,
};
const STATUS_PRIORITY: readonly StatusKind[] = [
	'Burn',
	'Poison',
	'Regen',
	'Haste',
];
// Offline (DEBUG_LOCAL_PLAYER) sim: there is no server, so a small client-only
// fixture seeds ground loot + a heal table to exercise the inventory loop. The
// real game is server-authoritative; this only runs when localMode is set.
const LOCAL_ITEM_KIND = 2;
const LOCAL_ITEM_EID_BASE = 1000;
// Deployable inventory items → the env object they place. Mirrors the server's
// game::deployables() table so online + offline placement render the same thing.
const DEPLOYABLES: ReadonlyMap<string, string> = new Map([
	['campfire-kit', 'campfire'],
]);
// How far (Chebyshev) from the player a deployable may be placed. Mirrors the
// server's PLACE_RANGE so the client ghost reads valid exactly when the server
// would accept the placement.
const PLACE_RANGE = 4;
// Offline-placed env objects get a private kind id + eid range so they don't
// collide with loot or the server's authoritative entities.
const LOCAL_ENV_KIND = 3;
const LOCAL_ENV_EID_BASE = 5000;
// Offline dropped items get eids well above the seeded-loot range to avoid
// colliding with LOCAL_LOOT (LOCAL_ITEM_EID_BASE + index).
const LOCAL_DROP_EID_OFFSET = 1000;
// After a drop, suppress walk-over auto-pickup briefly so the item doesn't
// bounce straight back into the inventory.
const DROP_PICKUP_GRACE_MS = 1200;
const LOCAL_LOOT: ReadonlyArray<{
	ref: string;
	count: number;
	dx: number;
	dy: number;
}> = [
	{ ref: 'potion', count: 3, dx: 1, dy: -2 },
	{ ref: 'potion', count: 1, dx: -2, dy: 1 },
	{ ref: 'coin', count: 12, dx: 2, dy: 2 },
];
const LOCAL_HEAL: ReadonlyMap<string, number> = new Map([['potion', 15]]);

/**
 * Collapse a 16-direction facing degree (screen-space, 0=N CW) into the four
 * cardinal directions the wire protocol carries. The server only needs a coarse
 * facing for remote-player pose; the client keeps the full 16-dir locally.
 */
function cardinalFromDeg(deg: number): Facing {
	const d = ((deg % 360) + 360) % 360;
	if (d >= 315 || d < 45) return 'Up';
	if (d < 135) return 'Right';
	if (d < 225) return 'Down';
	return 'Left';
}

export class IsoArpgScene extends Phaser.Scene {
	private client: GameClient | null = null;
	private store = new EntityStore<EntityRefs>();
	private kindRegistry = new Map<number, KindEntry>();
	private kinds!: KindResolvers;
	private slotUsername = new Map<number, string>();

	private dungeon = new DungeonField(DUNGEON_SEED, DUNGEON_RADIUS);
	// Gate-graph adapter over the dungeon: room centers are nav gates, edges are
	// the carved corridors weighted by width. Drives hierarchical click-pathing.
	private gateGraph: GateGraph = {
		chunkSize: CHUNK_SIZE,
		chunkOf: (x, y) => chunkOf(x, y),
		// Follows the active floor's seed (this.dungeon is rebuilt on a floor
		// change) so click-pathing routes on the floor the player is actually on.
		gate: (cx, cy) => chunkGate(this.dungeon.worldSeed, cx, cy),
		passageWidth: (acx, acy, bcx, bcy) =>
			chunkPassageWidth(this.dungeon.worldSeed, acx, acy, bcx, bcy),
	};
	private dungeonView!: DungeonView;
	private fog: FogState = makeFogState();
	private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
	private wasd!: Record<
		'up' | 'down' | 'left' | 'right',
		Phaser.Input.Keyboard.Key
	>;

	private netReady = false;
	private mySlot = -1;
	private myEid = -1;
	private predicted: TileXY = { x: 0, y: 0 };
	private moveSendAccumMs = 0;
	private wasMoving = false;
	private predictSeeded = false;
	private floatState: FloatState = makeFloatState({ x: 0, y: 0 });
	// Click-move route: A* waypoints (smoothed), consumed front-to-back. Empty =
	// no active click move. Keyboard input clears it.
	private movePath: TileXY[] = [];
	private bowShot: BowShot | null = null;
	// In-flight bow shot (online): the server-authoritative hit for `target` is
	// buffered until the local arrow lands so feedback syncs to impact.
	private inflightArrow: { target: number; arrived: boolean } | null = null;
	private bufferedHits = new Map<number, CombatEvent>();
	// Monsters despawned server-side by an in-flight arrow, held as corpses until
	// the arrow lands (keyed by server eid).
	private dyingSprites = new Map<number, EntityRefs>();
	private fireKey!: Phaser.Input.Keyboard.Key;
	// React HUD emit throttle + cached compass heading and minimap window.
	private hud: HudState = makeHudState();
	// Last cardinal facing sent to the server, so face() only fires on change.
	private lastSentFacing: Facing | null = null;
	// Dungeon floor the local player is on (z). Server-authoritative via the
	// `floor` event; snapshot entities on other floors are not rendered.
	private currentFloor = 0;
	// Floors above the dungeon (z <= SURFACE_MAX_Z) are open grassland: grass
	// ground, no dungeon walls/holes, everything walkable. Base layer for now.
	private isSurface = (): boolean => this.currentFloor <= SURFACE_MAX_Z;

	// Latest server-authoritative inventory (from EPHEMERAL_INVENTORY). Drives the
	// HUD panel and the 1-9 hotkeys.
	private inventory: InventoryItem[] = [];
	private spellLoadout: (string | undefined)[] = [];
	private spellMeta: Map<string, SpellMeta> = new Map();
	// Per-item resend cooldown (server eid -> next scene-time a pickup may fire).
	// The client predicts ahead of the server, so an early walk-over pickup can
	// land before the server sees us adjacent and gets rejected; we retry on a
	// short cadence until the successful pickup despawns the item.
	private pickupCooldown = new Map<number, number>();
	private static readonly PICKUP_RESEND_MS = 300;
	// Full inventory panel open state (toggled with I).
	private inventoryOpen = false;
	// Unsubscribe handle for HUD inventory intents (use/drop/reorder).
	private offIntent?: () => void;
	// Monotonic counter for offline dropped-item eids.
	private localDropSeq = 0;
	// Scene-time (ms) until which walk-over auto-pickup is suspended after a drop.
	private pickupSuspendUntil = 0;
	// Offline-only ground loot (server eid -> ref/count/tile). Empty online.
	private localItems = new Map<
		number,
		{ ref: string; count: number; tile: TileXY }
	>();

	private syncBridge!: SyncBridge<EntityRefs>;
	private syncResolvers!: SyncResolvers;
	private hoverTile!: Phaser.GameObjects.Graphics;
	private cursor!: CursorController;
	private localMode = false;
	// Active deployable placement: the item ref being placed (e.g. campfire-kit)
	// and a translucent ghost sprite tracking the cursor, tinted green/red for a
	// valid/invalid target. Null when not placing.
	private placingRef: string | null = null;
	private placeGhost: Phaser.GameObjects.Sprite | null = null;
	// Monotonic eid for offline-placed env objects.
	private localEnvSeq = 0;

	constructor() {
		super({ key: 'IsoArpgScene' });
	}

	preload() {
		this.load.image(GROUND_TEXTURE_KEY, arpgAsset(GROUND_TEXTURE_PATH));
		this.load.image(GRASS_TEXTURE_KEY, arpgAsset(GRASS_TEXTURE_PATH));
		preloadClass(this, RANGER_CLASS);
		preloadCreature(this, APEX_PREDATOR);
		for (const def of ENV_REGISTRY.values()) preloadEnv(this, def);
		preloadStairs(this);
	}

	create() {
		this.cameras.main.setBackgroundColor(COLORS.background);
		this.kinds = makeKindResolvers(this.kindRegistry);
		registerClassAnims(this, RANGER_CLASS);
		registerCreatureAnims(this, APEX_PREDATOR);
		for (const def of ENV_REGISTRY.values()) registerEnvAnims(this, def);

		this.drawGrid();
		buildFog(this, this.fog);
		this.setupInput();
		this.buildBridge();
		attachCameraZoom(this, { min: 0.5, max: 2.0, step: 0.2 });

		if (DEBUG_LOCAL_PLAYER) {
			// Offline test mode: drive a local ranger, skip the server entirely
			// (a guest/anon session still yields a jwt, so connectClient would
			// otherwise create a client + skip this spawn).
			this.spawnLocalPlayer();
		} else {
			this.connectClient();
		}

		this.time.addEvent({
			delay: HEARTBEAT_MS,
			loop: true,
			callback: () => this.client?.heartbeat(),
		});

		this.offIntent = onInventoryIntent((intent) =>
			this.handleInventoryIntent(intent),
		);

		this.initSpellLoadout();

		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
	}

	private drawGrid() {
		// Static base ground: one non-repeating texture laid on the iso plane.
		// It is just the backdrop — the dungeon's room/corridor look is a
		// separate tile eco-system drawn ON TOP later. The DungeonField still
		// drives walkability + streaming; it does NOT carve this base.
		this.dungeonView = makeDungeonView(this);
		this.refreshDungeon(DEBUG_SPAWN_TILE, true);
		this.placeStairs();
		this.hoverTile = this.makeHoverTile();
	}

	private refreshDungeon(focus: TileXY, force = false) {
		refreshDungeonView(
			this,
			this.dungeonView,
			this.dungeon,
			this.isSurface(),
			focus,
			force,
		);
	}

	private rebuildDungeon() {
		rebuildDungeonView(
			this,
			this.dungeonView,
			this.dungeon,
			this.isSurface(),
			this.predicted,
		);
	}

	private placeStairs() {
		placeStairsView(this, this.dungeonView, this.dungeon);
	}

	private makeHoverTile(): Phaser.GameObjects.Graphics {
		const g = this.add.graphics();
		g.setDepth(DEPTH_TILE + 1);
		g.fillStyle(COLORS.tileHover, 0.25);
		g.lineStyle(1.5, COLORS.tileHover, 0.8);
		g.beginPath();
		g.moveTo(0, -TILE_H / 2);
		g.lineTo(TILE_W / 2, 0);
		g.lineTo(0, TILE_H / 2);
		g.lineTo(-TILE_W / 2, 0);
		g.closePath();
		g.fillPath();
		g.strokePath();
		g.setVisible(false);
		return g;
	}

	private setupInput() {
		const kb = this.input.keyboard!;
		this.cursors = kb.createCursorKeys();
		this.wasd = {
			up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
			down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
			left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
			right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
		};
		this.fireKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
		// 1-9 cast the matching spell slot; Shift+1-9 use the matching inventory
		// slot. Read ev.code (Digit1..Digit9), not ev.key: holding Shift rewrites
		// ev.key to '!@#$%^&*(' on US layouts, but the code stays Digit-N.
		// I toggles the full inventory panel; Escape closes it.
		kb.on('keydown', (ev: KeyboardEvent) => {
			const digit = /^Digit([1-9])$/.exec(ev.code);
			if (digit) {
				const idx = Number(digit[1]) - 1;
				if (ev.shiftKey) this.useInventorySlot(idx);
				else this.castSpellSlot(idx);
			} else if (ev.key === 'i' || ev.key === 'I') {
				this.inventoryOpen = !this.inventoryOpen;
				emitInventoryOpen(this.inventoryOpen);
			} else if (DEBUG_LOCAL_PLAYER && ev.key === '<') {
				this.debugChangeFloor(-1); // ascend (toward grass surface)
			} else if (DEBUG_LOCAL_PLAYER && ev.key === '>') {
				this.debugChangeFloor(1); // descend (deeper dungeon)
			} else if (ev.key === 'Escape') {
				if (this.placingRef) {
					this.exitPlacement();
				} else if (this.inventoryOpen) {
					this.inventoryOpen = false;
					emitInventoryOpen(false);
				}
			}
		});
		this.input.mouse?.disableContextMenu();

		this.cursor = new CursorController(this.game.canvas);
		this.cursor.set(Cursor.Pointer);

		this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
			this.cursor.set(Cursor.Hold);
			const aim = screenToWorldF(pointer.worldX, pointer.worldY);
			const tile = { x: Math.round(aim.x), y: Math.round(aim.y) };

			// Placement mode: left-click commits the deployable, right-click cancels.
			if (this.placingRef) {
				if (pointer.rightButtonDown()) {
					this.exitPlacement();
				} else {
					this.commitPlacement(tile);
				}
				return;
			}

			// Right button = fire the bow at the cursor (left = move/attack).
			if (pointer.rightButtonDown()) {
				this.fireBowAt(aim);
				return;
			}

			// Reclaim an owned placed object (campfire). Checked before isBlocked
			// since the object occupies — and therefore blocks — its own tile.
			const owned = this.store.at(tile.x, tile.y, this.myEid);
			if (
				owned &&
				this.kinds.catName(this.store.kind(owned.serverEid)) ===
					'env' &&
				this.store.owner(owned.serverEid) === this.mySlot
			) {
				const d = Math.max(
					Math.abs(this.predicted.x - tile.x),
					Math.abs(this.predicted.y - tile.y),
				);
				if (d <= PLACE_RANGE) this.client?.pickupObject(tile);
				return;
			}

			if (this.isBlocked(tile.x, tile.y)) return;
			const hit = this.store.at(tile.x, tile.y, this.myEid);
			if (hit && this.isHostileServer(hit.serverEid)) {
				// Fire at the clicked enemy. fireBowAt sends the single
				// authoritative attack (targeting THIS enemy) — no separate
				// action() call, or the server would see a double-fire.
				this.movePath = [];
				this.fireBowAt(aim, hit.serverEid);
				return;
			}
			this.startMoveTo(tile);
		});

		this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
			this.updateCursorFor(
				screenToWorld(pointer.worldX, pointer.worldY),
				false,
			);
		});

		this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
			const tile = screenToWorld(pointer.worldX, pointer.worldY);
			this.updateCursorFor(tile, pointer.isDown);
			// Placement mode drives the ghost instead of the move-hover diamond.
			if (this.placingRef) {
				this.hoverTile.setVisible(false);
				this.updatePlaceGhost(tile);
				return;
			}
			if (this.isBlocked(tile.x, tile.y)) {
				this.hoverTile.setVisible(false);
				return;
			}
			const p = worldToScreen(tile.x, tile.y);
			this.hoverTile.setPosition(p.x, p.y).setVisible(true);
		});
	}

	// Hold while a button is down or placing; open hand (Take) over a pickup or
	// NPC; pointing finger otherwise.
	private updateCursorFor(tile: TileXY, pointerDown: boolean): void {
		if (this.placingRef || pointerDown) {
			this.cursor.set(Cursor.Hold);
			return;
		}
		const hit = this.store.at(tile.x, tile.y, this.myEid);
		const cat = hit
			? this.kinds.catName(this.store.kind(hit.serverEid))
			: null;
		this.cursor.set(
			cat === 'item' || cat === 'npc' ? Cursor.Take : Cursor.Pointer,
		);
	}

	private buildBridge() {
		this.syncBridge = {
			create: (e: EntityDelta, label) => {
				let refs: EntityRefs;
				const creatureSprite = isPlayerKind(this.kinds, e.kind)
					? null
					: makeCreatureSprite(this, this.kinds.ref(e.kind));
				if (isPlayerKind(this.kinds, e.kind)) {
					refs = this.makePlayerRefs(e.kind);
				} else if (creatureSprite) {
					refs = {
						sprite: creatureSprite.sprite,
						creature: creatureSprite.creature,
						interp: newInterp(this.time.now, e.tile.x, e.tile.y),
					};
					if (DEBUG_CREATURE_DIRS) {
						refs.dbgText = this.add
							.text(0, 0, '', {
								fontFamily: 'monospace',
								fontSize: '13px',
								color: '#34d399',
								stroke: '#000000',
								strokeThickness: 4,
							})
							.setOrigin(0.5, 1)
							.setDepth(DEPTH_UI + 2);
						refs.dbgArrow = this.add
							.graphics()
							.setDepth(DEPTH_UI + 2);
					}
				} else if (this.kinds.catName(e.kind) === 'env') {
					const envSprite = makeEnvSprite(
						this,
						this.kinds.ref(e.kind),
					);
					refs = {
						sprite:
							envSprite ??
							makeSprite(this, this.kinds, e.kind, false),
					};
				} else {
					refs = {
						sprite: makeSprite(
							this,
							this.kinds,
							e.kind,
							this.syncResolvers.hostile(e.kind),
						),
					};
				}
				this.placeSprite(refs.sprite, e.tile.x, e.tile.y);
				this.syncShadow(refs);
				// Ground loot bobs gently so it reads as a pickup, not scenery.
				if (this.kinds.catName(e.kind) === 'item') {
					this.tweens.add({
						targets: refs.sprite,
						y: refs.sprite.y - 6,
						duration: 650,
						yoyo: true,
						repeat: -1,
						ease: 'Sine.easeInOut',
					});
				}
				if (label) {
					refs.nameplate = makeNameplate(this, label);
					this.placeNameplate(refs);
				}
				refs.hpBar = this.add.graphics().setDepth(DEPTH_UI);
				refs.statusFx = this.add.graphics().setDepth(DEPTH_UI - 1);
				return refs;
			},
			move: (refs, tile) => {
				if (refs.interp) {
					pushSample(refs.interp, this.time.now, tile.x, tile.y);
				} else {
					this.tweenTo(refs, tile, true);
				}
			},
			setPos: (refs, tile) => {
				if (refs.interp)
					resetInterp(refs.interp, this.time.now, tile.x, tile.y);
				this.placeRefs(refs, tile);
			},
			follow: (refs) =>
				this.cameras.main.startFollow(refs.sprite, true, 0.12, 0.12),
			remove: (refs, eid) => {
				// A monster killed by the local player's in-flight arrow is
				// despawned server-side the instant the shot resolves — but the
				// arrow is still travelling. Hold it as a corpse (drop the HUD bits,
				// freeze motion) until the arrow lands; onArrowArrive plays its
				// death + number, then destroys it. Otherwise destroy now.
				if (
					this.inflightArrow?.target === eid &&
					!this.inflightArrow.arrived
				) {
					this.tweens.killTweensOf(refs.sprite);
					refs.settleTimer?.remove(false);
					refs.nameplate?.destroy();
					refs.hpBar?.destroy();
					refs.statusFx?.destroy();
					refs.dbgText?.destroy();
					refs.dbgArrow?.destroy();
					this.dyingSprites.set(eid, refs);
					return;
				}
				this.destroyRefs(refs);
			},
		};

		this.syncResolvers = {
			cat: (kind) => this.kinds.catName(kind),
			hostile: (kind) => {
				const cat = this.kinds.cat(kind);
				return cat === 1 && this.kindRegistry.get(kind) !== undefined;
			},
			label: (e, cat) => {
				if (cat === 'player') return this.slotUsername.get(e.owner);
				if (cat === 'npc') return this.kinds.ref(e.kind) ?? undefined;
				return undefined;
			},
		};
	}

	private connectClient() {
		const cfg = getNetConfig();
		if (!cfg) return;
		const client = new GameClient({
			url: cfg.wsUrl,
			jwt: cfg.jwt,
			kbveUsername: cfg.username,
		});
		this.client = client;

		client.on('welcome', (w: Welcome) => {
			this.netReady = true;
			this.mySlot = w.your_slot;
			this.kindRegistry.clear();
			for (const entry of w.registry ?? []) {
				this.kindRegistry.set(entry.kind, entry);
			}
		});
		client.on('snapshot', (s: Snapshot) => this.applySnapshot(s));
		client.on('combat', (c: CombatEvent) => this.onCombat(c));
		client.on('floor', (f: FloorChangeEvent) => this.onFloorChange(f));
		client.on('inventory', (inv: InventorySync) => {
			this.inventory = inv.items;
			emitInventory(inv.items);
		});
		// Placement rejected server-side (out of range, occupied): the item was
		// kept, so the inventory is unchanged — just clear the armed ghost.
		client.on('itemPlaced', (e: ItemPlacedEvent) => {
			if (!e.ok) this.exitPlacement();
		});

		client.connect();
	}

	// Use the item in inventory slot `idx` (0-based), bound to keys 1-9. The
	// server consumes it and applies the effect (heal/buff); the resulting
	// EPHEMERAL_INVENTORY refreshes the HUD.
	private useInventorySlot(idx: number): void {
		const item = this.inventory[idx];
		if (!item) return;
		// Deployables don't consume on use — they arm placement mode so the player
		// picks a target tile (server spawns the env object on commit).
		if (DEPLOYABLES.has(item.ref)) {
			this.enterPlacement(item.ref);
			return;
		}
		if (this.client) {
			this.client.useItem(item.ref);
			return;
		}
		if (!this.localMode) return;
		// Offline: apply the heal + consume the item client-side.
		const heal = LOCAL_HEAL.get(item.ref) ?? 0;
		if (heal > 0) {
			const hp = Math.min(
				this.store.maxHp(this.myEid),
				this.store.hp(this.myEid) + heal,
			);
			this.store.update(this.myEid, { hp });
		}
		const left = item.count - 1;
		this.inventory =
			left <= 0
				? this.inventory.filter((_, i) => i !== idx)
				: this.inventory.map((s, i) =>
						i === idx ? { ...s, count: left } : s,
					);
		emitInventory(this.inventory);
	}

	private initSpellLoadout(): void {
		void loadSpellMeta().then((meta) => {
			this.spellMeta = meta;
			const ordered = [...meta.values()].sort((a, b) => a.key - b.key);
			this.spellLoadout = ordered.slice(0, 9).map((s) => s.ref);
			emitSpellLoadout(ordered.slice(0, 9));
		});
	}

	private castSpellSlot(idx: number): void {
		const ref = this.spellLoadout[idx];
		if (!ref) return;
		const meta = this.spellMeta.get(ref);
		const targeted = meta?.effect === 'damage' || meta?.effect === 'status';
		const target = targeted ? this.nearestHostile(meta?.range ?? 0) : null;
		this.client?.castSpell(ref, target);
	}

	/**
	 * Nearest hostile NPC to the player, within `range` tiles (0 = unbounded).
	 * Returns the server eid or null when none is in range. v1 spell targeting
	 * is auto-acquire (no aim ray) — an honest nearest-in-range pick, not a fake
	 * hit; the server is authoritative on whether the cast lands.
	 */
	private nearestHostile(range: number): number | null {
		const me = this.predicted;
		let best: number | null = null;
		let bestD = Infinity;
		for (const sid of this.store.serverIdsWith('npc')) {
			if (!this.isHostileServer(sid)) continue;
			const t = this.store.tile(sid);
			if (!t) continue;
			const d = Math.max(Math.abs(t.x - me.x), Math.abs(t.y - me.y));
			if (range > 0 && d > range) continue;
			if (d < bestD) {
				bestD = d;
				best = sid;
			}
		}
		return best;
	}

	/**
	 * Arm placement mode for a deployable item: spawn a translucent ghost of the
	 * env it places that tracks the cursor, tinted for valid/invalid. Left-click
	 * commits, right-click / Escape cancels. A second arm of the same ref toggles
	 * it off.
	 */
	private enterPlacement(itemRef: string): void {
		if (this.placingRef === itemRef) {
			this.exitPlacement();
			return;
		}
		const envRef = DEPLOYABLES.get(itemRef);
		if (!envRef) return;
		this.exitPlacement();
		this.placingRef = itemRef;
		const ghost = makeEnvSprite(this, envRef);
		if (ghost) {
			ghost.setAlpha(0.55);
			ghost.setDepth(DEPTH_UI);
			this.placeGhost = ghost;
		}
		this.hoverTile.setVisible(false);
	}

	private exitPlacement(): void {
		this.placingRef = null;
		this.placeGhost?.destroy();
		this.placeGhost = null;
	}

	/** A placement target is valid when it's a free floor tile within reach of the
	 * player and not already occupied. Mirrors the server's place_item checks. */
	private canPlaceAt(tile: TileXY): boolean {
		if (this.isBlocked(tile.x, tile.y)) return false;
		if (this.store.at(tile.x, tile.y, this.myEid)) return false;
		const me = floatTile(this.floatState);
		const cheb = Math.max(Math.abs(tile.x - me.x), Math.abs(tile.y - me.y));
		return cheb <= PLACE_RANGE;
	}

	/** Move the ghost to a tile and tint it by validity. */
	private updatePlaceGhost(tile: TileXY): void {
		const ghost = this.placeGhost;
		if (!ghost) return;
		const p = worldToScreen(tile.x, tile.y);
		ghost.setPosition(p.x, p.y + 8);
		ghost.setDepth(DEPTH_UI);
		ghost.setTint(this.canPlaceAt(tile) ? 0x86efac : 0xf87171);
	}

	/**
	 * Commit the armed placement at a tile: server-authoritative online (the
	 * campfire appears via the snapshot env path; an itemPlaced reject reopens
	 * nothing since the server keeps the item), client-spawned offline.
	 */
	private commitPlacement(tile: TileXY): void {
		const itemRef = this.placingRef;
		if (!itemRef) return;
		if (!this.canPlaceAt(tile)) return;
		const idx = this.inventory.findIndex((s) => s.ref === itemRef);
		if (idx < 0) return;

		if (this.client) {
			this.client.placeItem(itemRef, tile);
			this.exitPlacement();
			return;
		}
		if (!this.localMode) {
			this.exitPlacement();
			return;
		}
		const envRef = DEPLOYABLES.get(itemRef);
		if (envRef) this.spawnLocalEnv(envRef, tile);
		const item = this.inventory[idx];
		const left = item.count - 1;
		this.inventory =
			left <= 0
				? this.inventory.filter((_, i) => i !== idx)
				: this.inventory.map((s, i) =>
						i === idx ? { ...s, count: left } : s,
					);
		emitInventory(this.inventory);
		this.exitPlacement();
	}

	/** Offline-only: spawn a placed env object as a real entity + block its tile,
	 * mirroring the server's apply_placements so the campfire reads the same. */
	private spawnLocalEnv(envRef: string, tile: TileXY): void {
		const kind = LOCAL_ENV_KIND;
		if (!this.kindRegistry.has(kind)) {
			this.kindRegistry.set(kind, { kind, ref: envRef, cat: 3 });
		}
		const eid = LOCAL_ENV_EID_BASE + this.localEnvSeq++;
		const sprite =
			makeEnvSprite(this, envRef) ??
			makeSprite(this, this.kinds, kind, false);
		this.placeSprite(sprite, tile.x, tile.y);
		this.store.spawn(
			eid,
			{
				tile,
				kind,
				cat: 'env',
				owner: 0,
				hostile: false,
				hp: 0,
				maxHp: 0,
			},
			{ sprite },
		);
	}

	// HUD drag-and-drop dispatch: use a slot, drop it to the floor, or reorder
	// two slots. The HUD is purely presentational; the scene owns the client +
	// offline sim, so all mutations route through here.
	private handleInventoryIntent(intent: InventoryIntent): void {
		switch (intent.type) {
			case 'use':
				this.useInventorySlot(intent.index);
				break;
			case 'drop':
				this.dropInventorySlot(intent.index);
				break;
			case 'reorder':
				this.reorderInventory(intent.from, intent.to);
				break;
		}
	}

	// Move slot `from` to index `to`, shifting the rest. The server owns slot
	// order (persisted), so online we send MoveItem and apply the same splice
	// optimistically — the authoritative refresh confirms it. Offline the splice
	// is the source of truth.
	private reorderInventory(from: number, to: number): void {
		const n = this.inventory.length;
		if (from < 0 || from >= n || to < 0 || to >= n || from === to) return;
		this.client?.moveItem(from, to);
		const next = this.inventory.slice();
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved);
		this.inventory = next;
		emitInventory(this.inventory);
	}

	// Drop the whole stack in slot `idx` to the floor at the player's tile. The
	// brief pickup-suspend stops walk-over auto-pickup from instantly grabbing it
	// back (both online and offline share the same auto-pickup loop).
	private dropInventorySlot(idx: number): void {
		const item = this.inventory[idx];
		if (!item) return;
		this.pickupSuspendUntil = this.time.now + DROP_PICKUP_GRACE_MS;
		if (this.client) {
			this.client.dropItem(item.ref, item.count);
			this.inventory = this.inventory.filter((_, i) => i !== idx);
			emitInventory(this.inventory);
			return;
		}
		if (!this.localMode) return;
		const me = floatTile(this.floatState);
		const tile = this.dungeon.nearestFloor({ x: me.x, y: me.y });
		const eid =
			LOCAL_ITEM_EID_BASE + LOCAL_DROP_EID_OFFSET + this.localDropSeq++;
		this.spawnLocalItem(eid, item.ref, item.count, tile);
		this.inventory = this.inventory.filter((_, i) => i !== idx);
		emitInventory(this.inventory);
	}

	// Walk-over pickup: any ground item within one tile is grabbed automatically.
	// The server validates proximity, despawns the item, and broadcasts the
	// updated inventory; the per-item cooldown throttles resends between attempts.
	private tryAutoPickup(): void {
		if (this.time.now < this.pickupSuspendUntil) return;
		const me = floatTile(this.floatState);
		if (this.client) {
			for (const sid of this.store.serverIdsWith('item')) {
				if (this.time.now < (this.pickupCooldown.get(sid) ?? 0))
					continue;
				const t = this.store.tile(sid);
				if (!t) continue;
				if (Math.max(Math.abs(t.x - me.x), Math.abs(t.y - me.y)) <= 1) {
					this.client.action(ACTION_PICKUP, sid);
					this.pickupCooldown.set(
						sid,
						this.time.now + IsoArpgScene.PICKUP_RESEND_MS,
					);
				}
			}
			return;
		}
		if (!this.localMode) return;
		for (const [eid, item] of this.localItems) {
			const d = Math.max(
				Math.abs(item.tile.x - me.x),
				Math.abs(item.tile.y - me.y),
			);
			if (d <= 1) this.localPickup(eid, item);
		}
	}

	/** Offline: grab a local ground item into the inventory + remove its sprite. */
	private localPickup(
		eid: number,
		item: { ref: string; count: number; tile: TileXY },
	): void {
		const refs = this.store.despawn(eid);
		if (refs) {
			this.tweens.killTweensOf(refs.sprite);
			refs.sprite.destroy();
		}
		this.localItems.delete(eid);
		const has = this.inventory.some((s) => s.ref === item.ref);
		this.inventory = has
			? this.inventory.map((s) =>
					s.ref === item.ref
						? { ...s, count: s.count + item.count }
						: s,
				)
			: [...this.inventory, { ref: item.ref, count: item.count }];
		emitInventory(this.inventory);
	}

	private applySnapshot(s: Snapshot) {
		for (const p of s.players) {
			this.slotUsername.set(p.slot, p.kbve_username);
		}
		const hadEid = this.myEid >= 0;
		const state: SyncState = {
			myEid: this.myEid,
			mySlot: this.mySlot,
			predicted: this.predicted,
			predictSeeded: this.predictSeeded,
		};
		// Only render entities on the floor the local player is on. The snapshot
		// is a single global broadcast (z rides each delta, default 0); the
		// client renders its own floor and ignores the rest. Entities that left
		// our floor fall out of the filtered set and despawn via applyEntitySync.
		const onFloor = s.entities.filter(
			(e) => (e.z ?? 0) === this.currentFloor,
		);
		applyEntitySync(
			onFloor,
			this.store,
			this.syncBridge,
			this.syncResolvers,
			state,
			this.markEnvDirty,
		);
		this.myEid = state.myEid;
		this.predicted = state.predicted;
		this.predictSeeded = state.predictSeeded;

		// Seed the float body when our entity first appears; thereafter soft-
		// correct it toward the server-authoritative tile so the client stays
		// smooth without drifting away from the server.
		if (!hadEid && this.myEid >= 0) {
			this.floatState = makeFloatState(state.serverPos ?? this.predicted);
			this.refreshDungeon(this.predicted, true);
		} else if (this.myEid >= 0 && state.serverPos) {
			this.reconcilePlayer(
				state.serverPos,
				state.serverVel ?? { x: 0, y: 0 },
				state.inputAck ?? 0,
			);
			this.refreshDungeon(this.predicted);
		}
		this.refreshHud();
	}

	private reconcilePlayer(
		serverPos: TileXY,
		serverVel: TileXY,
		inputAck: number,
	) {
		const unacked = this.client?.ackMoves(inputAck) ?? [];
		const replay = makeFloatState(serverPos);
		// Seed the replay with the server's reported velocity so unacked inputs
		// reproduce the authoritative coast; replaying from rest left the body
		// trailing the server's still-moving position and drifting on stop.
		replay.vel.x = serverVel.x;
		replay.vel.y = serverVel.y;
		for (const m of unacked) {
			const speed = m.run ? RUN_SPEED : WALK_SPEED;
			stepFloat(
				replay,
				{ x: m.mx / 127, y: m.my / 127 },
				speed,
				this.isBlocked,
				SIM_DT_MS,
			);
		}
		reconcileFloat(this.floatState, replay.pos);
	}

	private onCombat(c: CombatEvent) {
		// The server resolves a bow shot the instant it looses, but the client's
		// arrow is still in flight. If this hit is from the local player's arrow
		// heading at this target, defer the feedback until the arrow lands
		// (flushed in onArrowArrive / a travel-time fallback) so the number and
		// recoil sync to impact instead of popping at release.
		if (
			c.attacker === this.myEid &&
			this.inflightArrow &&
			this.inflightArrow.target === c.target &&
			!this.inflightArrow.arrived
		) {
			// Hold it — onArrowArrive (scheduled at the arrow's travel time, or
			// fired early by the visual hit-test) shows it on impact.
			this.bufferedHits.set(c.target, c);
			return;
		}
		this.showCombat(c);
	}

	/**
	 * The local player's arrow reached its target: release the deferred server
	 * hit (number, recoil/death) and, if the target was a kill held as a corpse,
	 * play its death then clear it. Idempotent — both the visual hit-test and the
	 * travel-time timer call it.
	 */
	private onArrowArrive(target: number) {
		if (this.inflightArrow?.target === target)
			this.inflightArrow.arrived = true;
		const c = this.bufferedHits.get(target);
		if (c) {
			this.bufferedHits.delete(target);
			this.showCombat(c);
		}
		const corpse = this.dyingSprites.get(target);
		if (corpse) {
			this.dyingSprites.delete(target);
			if (
				corpse.creature &&
				corpse.sprite instanceof Phaser.GameObjects.Sprite
			) {
				setCreaturePose(corpse.sprite, corpse.creature, 'Dead');
				this.time.delayedCall(CORPSE_FADE_MS, () =>
					this.destroyRefs(corpse),
				);
			} else {
				this.destroyRefs(corpse);
			}
		}
		if (this.inflightArrow?.target === target) this.inflightArrow = null;
	}

	private showCombat(c: CombatEvent) {
		const refs =
			this.store.refs(c.target) ?? this.dyingSprites.get(c.target);
		if (!refs) return;
		floatingText(
			this,
			refs.sprite.x,
			refs.sprite.y - refs.sprite.displayHeight - 18,
			c.crit ? `CRIT ${c.dmg}!` : `-${c.dmg}`,
			c.crit ? '#fbbf24' : '#f87171',
			DEPTH_UI + 2,
		);
		if (refs.sprite instanceof Phaser.GameObjects.Sprite) {
			flashEntity(this, refs.sprite);
		}

		// Drive creature combat poses: the attacker swings (facing its target),
		// the victim recoils (or dies). Non-arrow deaths still settle via the
		// hp<=0 check in refreshHud.
		const atk = this.store.refs(c.attacker);
		if (atk?.creature && atk.sprite instanceof Phaser.GameObjects.Sprite) {
			const a = this.store.tile(c.attacker);
			const t = this.store.tile(c.target);
			const face = a && t ? { dx: t.x - a.x, dy: t.y - a.y } : undefined;
			setCreaturePose(atk.sprite, atk.creature, 'Attack1', face);
		}
		if (refs.creature && refs.sprite instanceof Phaser.GameObjects.Sprite) {
			setCreaturePose(
				refs.sprite,
				refs.creature,
				c.died ? 'Dead' : 'GetHit',
			);
		}
	}

	/** Tear down an entity's display objects. */
	private destroyRefs(refs: EntityRefs) {
		refs.settleTimer?.remove(false);
		refs.shadow?.destroy();
		refs.nameplate?.destroy();
		refs.hpBar?.destroy();
		refs.statusFx?.destroy();
		refs.dbgText?.destroy();
		refs.dbgArrow?.destroy();
		refs.sprite.destroy();
	}

	/**
	 * The local player took a stair: the server moved us to a new dungeon floor.
	 * Snap the float body to the destination tile, switch the active floor (so
	 * collision + rendering use the new layout), and re-stream the dungeon. The
	 * dungeon field is rebuilt for the new z.
	 */
	private onFloorChange(f: FloorChangeEvent) {
		this.currentFloor = f.z;
		this.predicted = { x: f.tile.x, y: f.tile.y };
		this.floatState = makeFloatState(this.predicted);
		this.dungeon = new DungeonField(
			floorSeed(DUNGEON_SEED, f.z),
			DUNGEON_RADIUS,
		);
		resetHudMap(this.hud);
		this.rebuildDungeon();
		this.placeStairs();
	}

	/**
	 * Offline-only floor change (no server). Mirrors the server stair link: dz=-1
	 * ascends onto the target floor's Down stair, dz=+1 descends onto its Up
	 * stair, so the local player lands on a real tile. Lets us test the grass
	 * surface (z<0) without a live arpg-server.
	 */
	private debugChangeFloor(dz: number) {
		const z = this.currentFloor + dz;
		const land = dz < 0 ? StairKind.Down : StairKind.Up;
		const tile = stairTile(floorSeed(DUNGEON_SEED, z), land);
		this.onFloorChange({ z, tile });
	}

	update(time: number, delta: number) {
		this.tickCreatureInterp();
		this.tickFacing();
		syncFogToZoom(this, this.fog);
		if (this.envDirty) {
			this.refreshEnvBlocked();
			this.envDirty = false;
		}

		if ((!this.client && !this.localMode) || !this.predictSeeded) return;

		// Space fires the bow toward the cursor.
		if (Phaser.Input.Keyboard.JustDown(this.fireKey)) {
			const ptr = this.input.activePointer;
			this.fireBowAt(screenToWorldF(ptr.worldX, ptr.worldY));
		}

		const myRefs = this.store.refs(this.myEid);
		if (myRefs) this.tickLocalMotion(myRefs, delta);

		this.tryAutoPickup();
		// Redraw health bars every frame so they track the smoothly interpolated
		// sprite instead of lagging behind it at snapshot cadence.
		this.refreshHud();
		this.tickHud(delta);
	}

	private tickHud(deltaMs: number) {
		tickHud(this.hud, this.hudDeps(), deltaMs);
	}

	private hudDeps() {
		return {
			scene: this,
			store: this.store,
			floatState: this.floatState,
			dungeon: this.dungeon,
			myEid: this.myEid,
			surface: this.isSurface(),
			playerName: this.localPlayerName(),
		};
	}

	/**
	 * Float-driven local movement: keyboard (held = continuous intent) or a
	 * click destination feeds a world-tile intent vector into the float sim,
	 * which is then rendered, animated (Run/Idle by speed), and synced to the
	 * server as cardinal steps whenever the underlying tile changes.
	 */
	private tickLocalMotion(refs: EntityRefs, deltaMs: number) {
		const intent = this.readIntent();
		const prevTile = floatTile(this.floatState);

		// Walk tier while Shift is held; run otherwise. Each tier's body speed
		// is tuned to its anim's stride, so feet don't slide at either pace.
		const walking = this.cursors.shift?.isDown ?? false;
		const speed = walking ? WALK_SPEED : RUN_SPEED;
		stepFloat(this.floatState, intent, speed, this.isBlocked, deltaMs);

		// Locomotion anim follows ACTIVE INTENT, not residual velocity: the
		// moment input stops the body flips to Idle, even though friction is
		// still bleeding the leftover velocity to a slide-stop. Keying off
		// velocity instead left a few frames of run-in-place during decel.
		const intending = Math.hypot(intent.x, intent.y) > 0;
		// Moving cancels an in-progress shot: switch straight to Run instead of
		// sliding in the bow pose. If the cancel lands before the release frame
		// the arrow is suppressed (no shot fired); if it already loosed, the
		// arrow still flies and only the recover is cut.
		if (intending && this.bowShot?.busy) {
			this.bowShot.cancel();
		}
		const firing = this.bowShot?.busy ?? false;
		if (
			!firing &&
			refs.cls &&
			refs.sprite instanceof Phaser.GameObjects.Sprite
		) {
			if (intending) {
				setClassPose(
					refs.sprite,
					refs.cls,
					walking ? 'WalkForward' : 'Run',
					{ dx: this.floatState.vel.x, dy: this.floatState.vel.y },
					this,
				);
			} else if (
				refs.cls.state === 'Run' ||
				refs.cls.state === 'WalkForward'
			) {
				setClassPose(refs.sprite, refs.cls, 'Idle', undefined, this);
			}
		}

		// While standing still (not moving, not firing), track the cursor: turn
		// the body toward where the player is aiming so she's pre-aimed before a
		// shot. tickClassFacing lerps targetDeg, so this reads as a natural turn.
		if (!intending && !firing && refs.cls) {
			const ptr = this.input.activePointer;
			const aim = screenToWorldF(ptr.worldX, ptr.worldY);
			const dx = aim.x - this.floatState.pos.x;
			const dy = aim.y - this.floatState.pos.y;
			if (Math.hypot(dx, dy) > 0.05) {
				const deg = facingDegFromDelta(dx, dy);
				refs.cls.targetDeg = deg;
				this.sendFacing(cardinalFromDeg(deg));
			}
		}

		this.renderFloat(refs);

		// Keep the server roughly in sync: emit a cardinal step toward whatever
		// new tile the float body has entered. The server stays authoritative;
		// reconcileFloat soft-corrects any drift on the next snapshot.
		const tile = floatTile(this.floatState);
		if (tile.x !== prevTile.x || tile.y !== prevTile.y) {
			this.predicted = tile;
			this.refreshDungeon(tile);
		}

		this.moveSendAccumMs += deltaMs;
		// Flush a release (moving -> idle) immediately instead of waiting for the
		// 50ms cadence, so the server stops powering the held intent a throttle
		// window sooner — cuts the on-stop over-travel the client can't predict.
		const idleNow = intent.x === 0 && intent.y === 0;
		const releaseEdge = this.wasMoving && idleNow;
		if (releaseEdge || this.moveSendAccumMs >= 50) {
			this.moveSendAccumMs = 0;
			const mag = Math.hypot(intent.x, intent.y);
			const moving = mag > 0;
			if (moving || this.wasMoving) {
				const mx = moving ? Math.round((intent.x / mag) * 127) : 0;
				const my = moving ? Math.round((intent.y / mag) * 127) : 0;
				this.client?.move(mx, my, !walking);
			}
			this.wasMoving = moving;
		}

		// Drop the click route once the FINAL tile is reached or overshot, so the
		// float never orbits the goal stuck in Run (intermediate waypoints are
		// consumed in readIntent).
		if (this.movePath.length === 1) {
			const goal = this.movePath[0];
			const dx = goal.x - this.floatState.pos.x;
			const dy = goal.y - this.floatState.pos.y;
			const dist = Math.hypot(dx, dy);
			const overshot =
				dx * this.floatState.vel.x + dy * this.floatState.vel.y < 0;
			if (dist < ARRIVE_DIST || (overshot && dist < 1)) {
				this.movePath = [];
			}
		}
	}

	/**
	 * World-tile intent vector. Held keys win (and cancel any click route);
	 * otherwise follow the A* path — steer toward the current waypoint, pop it
	 * on arrival, and aim straight at the final tile (sub-unit intent near the
	 * end so the body eases to a stop instead of overshooting).
	 */
	private readIntent(): TileXY {
		const ix =
			(this.cursors.right.isDown || this.wasd.right.isDown ? 1 : 0) -
			(this.cursors.left.isDown || this.wasd.left.isDown ? 1 : 0);
		const iy =
			(this.cursors.down.isDown || this.wasd.down.isDown ? 1 : 0) -
			(this.cursors.up.isDown || this.wasd.up.isDown ? 1 : 0);
		if (ix !== 0 || iy !== 0) {
			this.movePath = []; // keys override a click move
			return { x: ix, y: iy };
		}

		while (this.movePath.length > 0) {
			const wp = this.movePath[0];
			const dx = wp.x - this.floatState.pos.x;
			const dy = wp.y - this.floatState.pos.y;
			const dist = Math.hypot(dx, dy);
			// Reached this waypoint — pop and aim at the next. Use a looser
			// threshold for intermediate waypoints so the body doesn't have to
			// pass dead-center, only the final tile eases to a precise stop.
			const last = this.movePath.length === 1;
			const reach = last ? ARRIVE_DIST : WAYPOINT_REACH;
			if (dist < reach) {
				this.movePath.shift();
				continue;
			}
			return { x: dx, y: dy };
		}
		return { x: 0, y: 0 };
	}

	/** Draw the local sprite at its fractional float position. */
	private renderFloat(refs: EntityRefs) {
		const p = worldToScreen(this.floatState.pos.x, this.floatState.pos.y);
		refs.sprite.setPosition(p.x, p.y + 8);
		refs.sprite.setDepth(
			DEPTH_ENTITY_BASE +
				tileDepth(this.floatState.pos.x, this.floatState.pos.y),
		);
		this.syncShadow(refs);
		this.placeNameplate(refs);
	}

	private tickCreatureInterp() {
		const renderTime = this.time.now - INTERP_DELAY_MS;
		for (const [, , refs] of this.store.entries()) {
			if (!refs.interp || !refs.creature) continue;
			if (!(refs.sprite instanceof Phaser.GameObjects.Sprite)) continue;
			const s = sampleAt(refs.interp, renderTime);
			if (!s) continue;
			const p = worldToScreen(s.x, s.y);
			refs.sprite.setPosition(p.x, p.y + 8);
			refs.sprite.setDepth(
				DEPTH_ENTITY_BASE + tileDepth(Math.round(s.x), Math.round(s.y)),
			);
			this.syncShadow(refs);
			this.placeNameplate(refs);
			const st = refs.creature.state;
			if (st !== 'Idle' && st !== 'Walking' && st !== 'Running') continue;
			if (s.moving && (Math.abs(s.vx) > 1e-4 || Math.abs(s.vy) > 1e-4)) {
				setCreaturePose(refs.sprite, refs.creature, 'Walking', {
					dx: s.vx,
					dy: s.vy,
				});
			} else {
				setCreaturePose(refs.sprite, refs.creature, 'Idle');
			}
		}
	}

	/** Lerp every class entity's facing toward its movement target this frame. */
	private tickFacing() {
		for (const [, , refs] of this.store.entries()) {
			if (refs.cls && refs.sprite instanceof Phaser.GameObjects.Sprite) {
				tickClassFacing(refs.sprite, refs.cls);
			} else if (
				refs.creature &&
				refs.sprite instanceof Phaser.GameObjects.Sprite
			) {
				tickCreatureFacing(refs.sprite, refs.creature);
				if (DEBUG_CREATURE_DIRS) this.drawCreatureDebug(refs);
			}
		}
	}

	/**
	 * Debug overlay: a green arrow in the creature's TRUE screen heading
	 * (targetDeg, straight from the movement delta) plus the sheet direction
	 * block the code currently picked. If the body visually faces away from the
	 * arrow, the art<->direction mapping in creatures.ts is off.
	 */
	private drawCreatureDebug(refs: EntityRefs) {
		if (
			!refs.creature ||
			!(refs.sprite instanceof Phaser.GameObjects.Sprite)
		)
			return;
		const sx = refs.sprite.x;
		const sy = refs.sprite.y - refs.sprite.displayHeight * 0.45;
		if (refs.dbgText) {
			refs.dbgText.setText(
				`${refs.creature.dir} ${Math.round(refs.creature.targetDeg)}°`,
			);
			refs.dbgText.setPosition(sx, sy - 14);
		}
		if (refs.dbgArrow) {
			const rad = (refs.creature.targetDeg * Math.PI) / 180;
			const vx = Math.sin(rad);
			const vy = -Math.cos(rad);
			const len = 34;
			const ex = sx + vx * len;
			const ey = sy + vy * len;
			const g = refs.dbgArrow;
			g.clear();
			g.lineStyle(3, 0x34d399, 1);
			g.beginPath();
			g.moveTo(sx, sy);
			g.lineTo(ex, ey);
			g.strokePath();
			// arrowhead
			const ah = 8;
			const a1 = rad + Math.PI * 0.85;
			const a2 = rad - Math.PI * 0.85;
			g.beginPath();
			g.moveTo(ex, ey);
			g.lineTo(ex + Math.sin(a1) * ah, ey - Math.cos(a1) * ah);
			g.moveTo(ex, ey);
			g.lineTo(ex + Math.sin(a2) * ah, ey - Math.cos(a2) * ah);
			g.strokePath();
		}
	}

	/**
	 * Click-move: hierarchical route from the body's tile to the clicked tile.
	 * The gate graph picks the room-to-room chunk route and tile A* refines each
	 * leg, so long cross-dungeon clicks stay cheap and follow corridor centers
	 * instead of straight-lining into a wall. No path = no move.
	 */
	private startMoveTo(tile: TileXY) {
		if (!this.client && !this.localMode) return;
		const start = floatTile(this.floatState);
		const path = findHierPath(
			start,
			tile,
			(x, y) => !this.isBlocked(x, y),
			this.gateGraph,
		);
		if (!path) {
			this.movePath = [];
			return;
		}
		this.movePath = path;
	}

	// Tiles occupied by env objects (campfire, …), rebuilt once per frame from the
	// ECS store so local prediction blocks the same tiles the server does — else
	// the player walks onto a campfire then snaps back on the next snapshot.
	private envBlocked = new Set<string>();
	// Set by netSync on any env spawn/despawn/move; the set is rebuilt on the next
	// frame instead of every frame. Starts dirty so the first snapshot seeds it.
	private envDirty = true;

	private markEnvDirty = (): void => {
		this.envDirty = true;
	};

	private refreshEnvBlocked(): void {
		this.envBlocked.clear();
		for (const sid of this.store.serverIdsWith('env')) {
			const t = this.store.tile(sid);
			if (t) this.envBlocked.add(`${t.x},${t.y}`);
		}
	}

	// Endless dungeon: a tile is walkable iff it's a generated floor tile AND not
	// occupied by an env blocker. No fixed bounds — walls are the absence of floor.
	private isBlocked = (x: number, y: number): boolean => {
		if (this.isSurface()) return this.envBlocked.has(`${x},${y}`);
		return !this.dungeon.isFloor(x, y) || this.envBlocked.has(`${x},${y}`);
	};

	private isHostileServer(serverEid: number): boolean {
		const kind = this.store.kind(serverEid);
		return kind >= 0 && this.syncResolvers.hostile(kind);
	}

	private placeSprite(sprite: EntityRefs['sprite'], tx: number, ty: number) {
		const p = worldToScreen(tx, ty);
		sprite.setPosition(p.x, p.y + 8);
		sprite.setDepth(DEPTH_ENTITY_BASE + tileDepth(tx, ty));
	}

	private placeRefs(refs: EntityRefs, tile: TileXY) {
		this.placeSprite(refs.sprite, tile.x, tile.y);
		this.syncShadow(refs);
		this.placeNameplate(refs);
	}

	/**
	 * The shadow is the asset's baked Shadow layer, frame-locked to the Body, so
	 * it just mirrors the body sprite's exact transform and renders one depth
	 * below it. No ground projection or foot fudge — the artist already aligned
	 * the shadow to the feet for every angle and frame.
	 */
	private syncShadow(refs: EntityRefs) {
		if (!refs.shadow) return;
		refs.shadow.setPosition(refs.sprite.x, refs.sprite.y);
		refs.shadow.setDepth(refs.sprite.depth - 1);
	}

	private makePlayerRefs(kind: number): EntityRefs {
		const { sprite, shadow, cls } = makeClassSprite(
			this,
			this.kinds.ref(kind),
		);
		return { sprite, shadow, cls };
	}

	/** Resolved display name: Supabase username, else the saved prompt name. */
	private localPlayerName(): string {
		return resolvePlayerName() || 'Ranger';
	}

	/**
	 * Offline debug: no server, so no snapshot ever spawns the player. Register
	 * a local ranger player kind, drop the character at the debug tile, and seed
	 * prediction so keyboard/click drive it client-side (sends are no-ops while
	 * `this.client` is null). Lets the character render + move without a server.
	 */
	private spawnLocalPlayer() {
		if (this.store.has(LOCAL_PLAYER_EID)) return;
		this.localMode = true;
		const kind = LOCAL_PLAYER_KIND;
		this.kindRegistry.set(kind, {
			kind,
			ref: RANGER_CLASS.id,
			cat: 0, // KIND_CAT_PLAYER
		});
		// Drop onto the nearest floor tile so the spawn never lands in a wall.
		const tile = this.dungeon.nearestFloor(DEBUG_SPAWN_TILE);
		const refs = this.makePlayerRefs(kind);
		// Nameplate from the Supabase session username (kbve_username claim);
		// falls back to the class name when not signed in (offline testing).
		refs.nameplate = makeNameplate(this, this.localPlayerName());
		this.placeSprite(refs.sprite, tile.x, tile.y);
		this.syncShadow(refs);
		this.placeNameplate(refs);
		refs.hpBar = this.add.graphics().setDepth(DEPTH_UI);
		refs.statusFx = this.add.graphics().setDepth(DEPTH_UI - 1);
		this.store.spawn(
			LOCAL_PLAYER_EID,
			{
				tile,
				kind,
				cat: 'player',
				owner: 0,
				hostile: false,
				hp: 100,
				maxHp: 100,
			},
			refs,
		);
		this.myEid = LOCAL_PLAYER_EID;
		this.predicted = { ...tile };
		this.predictSeeded = true;
		this.floatState = makeFloatState(tile);
		this.cameras.main.startFollow(refs.sprite, true, 0.12, 0.12);
		this.cameras.main.setZoom(1.5);

		// Seed offline loot so the inventory loop is testable without a server.
		LOCAL_LOOT.forEach((l, i) => {
			const t = this.dungeon.nearestFloor({
				x: tile.x + l.dx,
				y: tile.y + l.dy,
			});
			this.spawnLocalItem(LOCAL_ITEM_EID_BASE + i, l.ref, l.count, t);
		});
	}

	/** Offline only: render a floating ground-loot sprite tracked in localItems. */
	private spawnLocalItem(
		eid: number,
		ref: string,
		count: number,
		tile: TileXY,
	): void {
		if (!this.kindRegistry.has(LOCAL_ITEM_KIND)) {
			this.kindRegistry.set(LOCAL_ITEM_KIND, {
				kind: LOCAL_ITEM_KIND,
				ref,
				cat: 2, // KIND_CAT_ITEM
			});
		}
		const sprite = makeSprite(this, this.kinds, LOCAL_ITEM_KIND, false);
		this.placeSprite(sprite, tile.x, tile.y);
		this.tweens.add({
			targets: sprite,
			y: sprite.y - 6,
			duration: 650,
			yoyo: true,
			repeat: -1,
			ease: 'Sine.easeInOut',
		});
		this.store.spawn(
			eid,
			{
				tile,
				kind: LOCAL_ITEM_KIND,
				cat: 'item',
				owner: 0,
				hostile: false,
				hp: 0,
				maxHp: 0,
			},
			{ sprite },
		);
		this.localItems.set(eid, { ref, count, tile });
	}

	/**
	 * Fire the ranger's bow at a world tile: Draw windup -> Loose -> arrow. The
	 * shot is gated so you can't re-fire mid-draw, and it cancels any active
	 * click-move (you plant to shoot). Damage is resolved locally for now; the
	 * server combat path replaces the onHit body when MP lands.
	 */
	/** Send the cardinal aim to the server, but only when it changes. */
	private sendFacing(facing: Facing) {
		if (facing === this.lastSentFacing) return;
		this.lastSentFacing = facing;
		this.client?.face(facing);
	}

	private fireBowAt(aim: TileXY, target?: number) {
		if (this.bowShot?.busy) return;
		const refs = this.store.refs(this.myEid);
		if (!refs?.cls || !(refs.sprite instanceof Phaser.GameObjects.Sprite))
			return;
		this.movePath = [];
		const from = { x: this.floatState.pos.x, y: this.floatState.pos.y };
		const shotTarget = target ?? this.acquireBowTarget(from, aim);
		// Fly the arrow AT the acquired enemy (not the raw cursor point) so the
		// visual shot connects with whatever the server resolves — a near-path
		// target snaps the arrow onto it instead of sailing past.
		const shotTile =
			shotTarget != null ? (this.store.tile(shotTarget) ?? aim) : aim;
		this.bowShot = fireBow(
			this,
			refs.sprite,
			refs.cls,
			from,
			shotTile,
			(tx, ty) => this.arrowHitTest(tx, ty),
			(serverEid, dmg) => {
				if (this.localMode) {
					this.applyLocalHit(serverEid, dmg);
					return;
				}
				// Online: the arrow reached a still-living target — land the
				// deferred server hit now.
				this.onArrowArrive(serverEid);
			},
			() => {
				this.client?.action(ACTION_SHOOT, shotTarget ?? null);
				if (shotTarget == null) {
					this.inflightArrow = null;
					return;
				}
				this.inflightArrow = { target: shotTarget, arrived: false };
				// A lethal shot despawns the target before the arrow's own
				// hit-test can fire, so settle the hit when the arrow WOULD
				// arrive (its travel time to the target tile).
				const dist = Math.hypot(
					shotTile.x - from.x,
					shotTile.y - from.y,
				);
				const travelMs =
					(Math.min(dist, ARROW_MAX_RANGE) / ARROW_SPEED) * 1000;
				this.time.delayedCall(travelMs + 30, () =>
					this.onArrowArrive(shotTarget),
				);
			},
		);
	}

	/**
	 * Acquire the hostile the arrow will actually hit by marching the aim ray in
	 * tile steps and returning the first hostile tile crossed — the SAME rounded
	 * `store.at` model the flying arrow's `arrowHitTest` uses. Keeping acquisition
	 * and the visual arrow on one hit model is what makes the server register the
	 * shot the player sees connect (a perpendicular-distance test diverged from
	 * the arrow and dropped grazing hits).
	 */
	private acquireBowTarget(from: TileXY, aim: TileXY): number | undefined {
		const adx = aim.x - from.x;
		const ady = aim.y - from.y;
		const amag = Math.hypot(adx, ady);
		if (amag < 1e-3) return undefined;
		const nx = adx / amag;
		const ny = ady / amag;
		// Thick-ray: the arrow flies a direction, so it hits the FIRST hostile
		// along that line — the nearest one whose center sits within
		// BOW_ACQUIRE_PERP tiles of the centerline, in range. Forgiving so a
		// roughly-aimed shot still connects, while staying first-in-path.
		let best: number | undefined;
		let bestAlong = Infinity;
		for (const [serverEid] of this.store.entries()) {
			if (!this.isHostileServer(serverEid)) continue;
			const t = this.store.tile(serverEid);
			if (!t) continue;
			const dx = t.x - from.x;
			const dy = t.y - from.y;
			const along = dx * nx + dy * ny;
			if (along <= 0 || along > ARROW_MAX_RANGE) continue;
			const perp = Math.abs(dx * ny - dy * nx);
			if (perp > BOW_ACQUIRE_PERP) continue;
			if (along < bestAlong) {
				bestAlong = along;
				best = serverEid;
			}
		}
		return best;
	}

	/**
	 * Arrow hit-test: first HOSTILE entity occupying the tile, else miss. Only
	 * hostiles collide so the arrow flies through placed props (campfires),
	 * ground loot, and friendly players instead of being consumed by them.
	 */
	private arrowHitTest(tx: number, ty: number) {
		const hit = this.store.at(tx, ty, this.myEid);
		if (!hit || !this.isHostileServer(hit.serverEid)) return null;
		return {
			serverEid: hit.serverEid,
			x: hit.refs.sprite.x,
			y: hit.refs.sprite.y,
		};
	}

	/** Local damage application + VFX (placeholder until server confirms). */
	private applyLocalHit(serverEid: number, dmg: number) {
		const refs = this.store.refs(serverEid);
		if (!refs) return;
		const hp = Math.max(0, this.store.hp(serverEid) - dmg);
		this.store.update(serverEid, { hp });
		showDamage(
			this,
			refs.sprite.x,
			refs.sprite.y - refs.sprite.displayHeight - 18,
			dmg,
		);
		if (refs.sprite instanceof Phaser.GameObjects.Sprite) {
			flashEntity(this, refs.sprite);
		}
		this.refreshHud();
	}

	private tweenTo(refs: EntityRefs, tile: TileXY, settle = false) {
		const from = screenToWorld(refs.sprite.x, refs.sprite.y - 8);
		const p = worldToScreen(tile.x, tile.y);
		refs.sprite.setDepth(DEPTH_ENTITY_BASE + tileDepth(tile.x, tile.y));

		if (refs.cls && refs.sprite instanceof Phaser.GameObjects.Sprite) {
			setClassPose(
				refs.sprite,
				refs.cls,
				'Run',
				{ dx: tile.x - from.x, dy: tile.y - from.y },
				this,
			);
		} else if (
			refs.creature &&
			refs.sprite instanceof Phaser.GameObjects.Sprite
		) {
			setCreaturePose(refs.sprite, refs.creature, 'Walking', {
				dx: tile.x - from.x,
				dy: tile.y - from.y,
			});
		}

		// Pace the tween to the gap since this entity's last step so the sprite
		// glides continuously to each tile instead of racing there in a fixed
		// MOVE_TWEEN_MS and stalling until the next step (the stutter that left
		// the walk stride unfinished). Clamp to absorb the first step + lag.
		const now = this.time.now;
		const gap = refs.lastMoveAt ? now - refs.lastMoveAt : MOVE_TWEEN_MS;
		refs.lastMoveAt = now;
		const duration = Phaser.Math.Clamp(gap, MOVE_TWEEN_MS, 500);
		// A new step arrived — cancel any pending Idle settle so it keeps walking.
		refs.settleTimer?.remove(false);
		refs.settleTimer = undefined;

		this.tweens.add({
			targets: refs.sprite,
			x: p.x,
			y: p.y + 8,
			duration,
			ease: 'Linear',
			onUpdate: () => {
				this.placeNameplate(refs);
				this.syncShadow(refs);
			},
			onComplete: settle
				? () => {
						// Settle to Idle only after a grace with no further step,
						// so the gap between tiles doesn't flicker Walking->Idle.
						refs.settleTimer = this.time.delayedCall(duration, () =>
							this.settleRemoteIdle(refs),
						);
					}
				: undefined,
		});
	}

	/**
	 * Remote movers aren't input-driven, so settle them to Idle once stepping
	 * stops (no new step within the grace window). The local player is float-
	 * driven and settles itself in tickLocalMotion.
	 */
	private settleRemoteIdle(refs: EntityRefs) {
		if (!(refs.sprite instanceof Phaser.GameObjects.Sprite)) return;
		if (this.tweens.isTweening(refs.sprite)) return;
		if (refs.creature) {
			if (refs.creature.state !== 'Walking') return;
			setCreaturePose(refs.sprite, refs.creature, 'Idle');
			return;
		}
		if (!refs.cls) return;
		if (refs.cls.state !== 'Run') return;
		setClassPose(refs.sprite, refs.cls, 'Idle', undefined, this);
	}

	private placeNameplate(refs: EntityRefs) {
		if (!refs.nameplate) return;
		refs.nameplate.setPosition(
			refs.sprite.x,
			refs.sprite.y - refs.sprite.displayHeight * 0.62 - 8,
		);
	}

	private refreshHud() {
		const now = this.time.now;
		for (const [serverEid, , refs] of this.store.entries()) {
			const hp = this.store.hp(serverEid);
			const maxHp = this.store.maxHp(serverEid);

			if (refs.statusFx) {
				this.drawStatusFx(refs, this.store.effects(serverEid), now);
			}

			if (
				refs.cls &&
				refs.sprite instanceof Phaser.GameObjects.Sprite &&
				hp <= 0 &&
				refs.cls.state !== 'Death'
			) {
				setClassPose(refs.sprite, refs.cls, 'Death');
			}

			if (
				refs.creature &&
				refs.sprite instanceof Phaser.GameObjects.Sprite &&
				hp <= 0 &&
				refs.creature.state !== 'Dead'
			) {
				setCreaturePose(refs.sprite, refs.creature, 'Dead');
			}

			if (!refs.hpBar) continue;
			// Hostiles always show a bar so the player gets combat feedback the
			// moment a shot lands; friendlies only show one once they're hurt.
			const hostile = this.isHostileServer(serverEid);
			if (maxHp <= 0 || (!hostile && hp >= maxHp)) {
				refs.hpBar.clear();
				continue;
			}
			drawHealthBar(
				refs.hpBar,
				refs.sprite.x,
				refs.sprite.y - refs.sprite.displayHeight - 8,
				hp,
				maxHp,
			);
		}
	}

	// Status feedback: a pulsing ground aura tinted by the dominant effect (doubles
	// as the on-tile burn cue) plus a row of colour pips, one per active effect.
	// Kept off sprite.setTint so it never fights the combat hit-flash.
	private drawStatusFx(
		refs: EntityRefs,
		effects: readonly StatusView[],
		now: number,
	): void {
		const g = refs.statusFx;
		if (!g) return;
		g.clear();
		if (effects.length === 0) return;

		const sprite = refs.sprite;
		const footY = sprite.y;
		const dominant = STATUS_PRIORITY.find((k) =>
			effects.some((e) => e.kind === k),
		);
		if (dominant) {
			const color = STATUS_COLOR[dominant];
			// Sine pulse; burn/poison flicker harder than buffs for urgency.
			const fast = dominant === 'Burn' || dominant === 'Poison';
			const pulse =
				0.5 + 0.5 * Math.sin((now / (fast ? 90 : 220)) % (Math.PI * 2));
			const rx = sprite.displayWidth * 0.42;
			g.fillStyle(color, 0.18 + 0.22 * pulse);
			g.fillEllipse(sprite.x, footY, rx * 2, 12);
			g.lineStyle(1.5, color, 0.4 + 0.4 * pulse);
			g.strokeEllipse(sprite.x, footY, rx * 2, 12);
		}

		const pipY = footY - sprite.displayHeight - 14;
		const pipW = 5;
		const gap = 2;
		const totalW = effects.length * pipW + (effects.length - 1) * gap;
		let px = sprite.x - totalW / 2;
		for (const e of effects) {
			g.fillStyle(STATUS_COLOR[e.kind], 0.95);
			g.fillRect(px, pipY, pipW, pipW);
			px += pipW + gap;
		}
	}

	private teardown() {
		this.offIntent?.();
		this.offIntent = undefined;
		this.client?.close();
		this.client = null;
		clearHud();
	}
}
