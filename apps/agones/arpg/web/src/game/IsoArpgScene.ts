import Phaser from 'phaser';
import {
	GameClient,
	attachCameraZoom,
	drawHealthBar,
	type EntityDelta,
	type KindEntry,
	type Snapshot,
	type Welcome,
	type CombatEvent,
	type FloorChangeEvent,
	type InventorySync,
	type ItemPlacedEvent,
} from '@kbve/laser';
import {
	COLORS,
	TILE_W,
	TILE_H,
	MOVE_TWEEN_MS,
	HEARTBEAT_MS,
	DEPTH_TILE,
	DEPTH_ENTITY_BASE,
	DEPTH_UI,
	arpgAsset,
	GROUND_TEXTURE_KEY,
	GROUND_TEXTURE_PATH,
	GRASS_TEXTURE_KEY,
	GRASS_TEXTURE_PATH,
	SURFACE_MIN_Z,
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
import {
	setupInput as setupInputV,
	type SceneInputDeps,
} from './input/sceneInput';
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
import {
	placeSprite as placeSpriteV,
	placeRefs as placeRefsV,
	syncShadow as syncShadowV,
	placeNameplate as placeNameplateV,
	destroyRefs as destroyRefsV,
	drawStatusFx as drawStatusFxV,
	drawCreatureDebug as drawCreatureDebugV,
} from './systems/entityView';
import {
	makeCombatState,
	fireBowAt as fireBowAtV,
	onCombat as onCombatV,
	type CombatState,
	type CombatDeps,
} from './systems/combat';
import {
	makeInventoryState,
	setInventory,
	useInventorySlot as useInventorySlotV,
	handleInventoryIntent as handleInventoryIntentV,
	tryAutoPickup as tryAutoPickupV,
	exitPlacement as exitPlacementV,
	updatePlaceGhost as updatePlaceGhostV,
	commitPlacement as commitPlacementV,
	spawnLocalItem as spawnLocalItemV,
	LOCAL_ITEM_EID_BASE,
	type InventoryState,
	type InventoryDeps,
} from './systems/inventory';
import { EntityStore, packTile, Cat } from '@kbve/laser';
import { makeKindResolvers, type KindResolvers } from './systems/kindResolvers';
import {
	applyEntitySync,
	type SyncBridge,
	type SyncResolvers,
	type SyncState,
} from './systems/netSync';
import { makeFloatState, floatTile } from './systems/floatMotion';
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
import { preloadItemAtlas, makeItemSprite } from './entities/itemSprite';
import { itemKey } from './entities/itemMeta';
import {
	makeDungeonView,
	refreshDungeonView,
	rebuildDungeonView,
	placeStairs as placeStairsView,
	type DungeonView,
} from './systems/dungeonView';
import { type GateGraph } from './systems/pathfind';
import {
	makeMovementState,
	tickLocalMotion as tickLocalMotionV,
	reconcilePlayer as reconcilePlayerV,
	startMoveTo as startMoveToV,
	type MovementState,
	type MovementDeps,
} from './systems/movement';
import {
	clearHud,
	emitSpellLoadout,
	emitNotification,
	onInventoryIntent,
	type InventoryIntent,
} from './systems/hud';
import { loadSpellMeta, type SpellMeta } from './entities/spellMeta';
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
// Offline (DEBUG_LOCAL_PLAYER) sim: there is no server, so a small client-only
// fixture seeds ground loot to exercise the inventory loop. The real game is
// server-authoritative; this only runs when localMode is set.
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
	private predictSeeded = false;
	// Local player kinematic model: float body, click route, predicted tile,
	// move-send throttle. Shared with combat/hud/inventory.
	private move: MovementState = makeMovementState({ x: 0, y: 0 });
	// Bow-shot bookkeeping: in-flight arrow, deferred server hits, corpses.
	private combat: CombatState = makeCombatState();
	private fireKey!: Phaser.Input.Keyboard.Key;
	// React HUD emit throttle + cached compass heading and minimap window.
	private hud: HudState = makeHudState();
	// Dungeon floor the local player is on (z). Server-authoritative via the
	// `floor` event; snapshot entities on other floors are not rendered.
	private currentFloor = 0;
	// z is elevation: z>=SURFACE_MIN_Z (0) is open grassland — grass ground, no
	// dungeon walls/holes, all walkable. The dungeon is underground at z<0.
	private isSurface = (): boolean => this.currentFloor >= SURFACE_MIN_Z;
	// The surface up-stair leads to z>0 (cities/above-ground), which isn't built
	// yet — so it's a dead end. Tracks the tile we've already flashed the
	// "goes nowhere" notice for, so it fires once per step-on, not every frame.
	private deadStairTile: string | null = null;

	// Latest server-authoritative inventory (from EPHEMERAL_INVENTORY). Drives the
	// HUD panel and the 1-9 hotkeys.
	// Inventory + placement + offline-loot state (items, panel-open, pickup
	// cooldowns, deployable ghost). Drives the HUD panel and the 1-9 hotkeys.
	private inv: InventoryState = makeInventoryState();
	private spellLoadout: (string | undefined)[] = [];
	private spellMeta: Map<string, SpellMeta> = new Map();
	// Unsubscribe handle for HUD inventory intents (use/drop/reorder).
	private offIntent?: () => void;

	private syncBridge!: SyncBridge<EntityRefs>;
	private syncResolvers!: SyncResolvers;
	private hoverTile!: Phaser.GameObjects.Graphics;
	private localMode = false;

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
		preloadItemAtlas(this);
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
			this.move.predicted,
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
		const refs = setupInputV(this, this.inputDeps());
		this.cursors = refs.cursors;
		this.wasd = refs.wasd;
		this.fireKey = refs.fireKey;
	}

	private inputDeps(): SceneInputDeps {
		return {
			store: this.store,
			kinds: this.kinds,
			inv: this.inv,
			move: this.move,
			hoverTile: this.hoverTile,
			client: () => this.client,
			myEid: () => this.myEid,
			mySlot: () => this.mySlot,
			isBlocked: (x, y) => this.isBlocked(x, y),
			isHostile: (e) => this.isHostileServer(e),
			useInventorySlot: (i) => this.useInventorySlot(i),
			castSpellSlot: (i) => this.castSpellSlot(i),
			debugChangeFloor: (dz) => this.debugChangeFloor(dz),
			exitPlacement: () => this.exitPlacement(),
			commitPlacement: (t) => this.commitPlacement(t),
			updatePlaceGhost: (t) => this.updatePlaceGhost(t),
			fireBowAt: (a, t) => this.fireBowAt(a, t),
			startMoveTo: (t) => this.startMoveTo(t),
		};
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
				} else if (this.kinds.cat(e.kind) === Cat.Env) {
					const envSprite = makeEnvSprite(
						this,
						this.kinds.ref(e.kind),
					);
					refs = {
						sprite:
							envSprite ??
							makeSprite(this, this.kinds, e.kind, false),
					};
				} else if (this.kinds.cat(e.kind) === Cat.Item) {
					// Ground loot: crop the item's tile from the itemdb atlas (a "?"
					// placeholder until art lands). Falls back to the plain rect for
					// items with no atlas key.
					const key = itemKey(this.kinds.ref(e.kind));
					refs = {
						sprite:
							key > 0
								? makeItemSprite(this, key)
								: makeSprite(this, this.kinds, e.kind, false),
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
				if (this.kinds.cat(e.kind) === Cat.Item) {
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
					this.combat.inflightArrow?.target === eid &&
					!this.combat.inflightArrow.arrived
				) {
					this.tweens.killTweensOf(refs.sprite);
					refs.settleTimer?.remove(false);
					refs.nameplate?.destroy();
					refs.hpBar?.destroy();
					refs.statusFx?.destroy();
					refs.dbgText?.destroy();
					refs.dbgArrow?.destroy();
					this.combat.dyingSprites.set(eid, refs);
					return;
				}
				this.destroyRefs(refs);
			},
		};

		this.syncResolvers = {
			cat: (kind) => this.kinds.cat(kind),
			hostile: (kind) => {
				const cat = this.kinds.cat(kind);
				return cat === 1 && this.kindRegistry.get(kind) !== undefined;
			},
			label: (e, cat) => {
				if (cat === Cat.Player) return this.slotUsername.get(e.owner);
				if (cat === Cat.Npc) return this.kinds.ref(e.kind) ?? undefined;
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
			setInventory(this.inv, inv.items);
		});
		// Placement rejected server-side (out of range, occupied): the item was
		// kept, so the inventory is unchanged — just clear the armed ghost.
		client.on('itemPlaced', (e: ItemPlacedEvent) => {
			if (!e.ok) exitPlacementV(this.inv);
		});

		client.connect();
	}

	// Use the item in inventory slot `idx` (0-based), bound to keys 1-9. The
	// server consumes it and applies the effect (heal/buff); the resulting
	// EPHEMERAL_INVENTORY refreshes the HUD.
	private useInventorySlot(idx: number): void {
		useInventorySlotV(this.inv, this.invDeps(), idx);
	}

	private invDeps(): InventoryDeps {
		return {
			scene: this,
			store: this.store,
			kinds: this.kinds,
			kindRegistry: this.kindRegistry,
			client: () => this.client,
			myEid: () => this.myEid,
			localMode: () => this.localMode,
			floatTilePos: () => floatTile(this.move.floatState),
			dungeon: () => this.dungeon,
			isBlocked: (x, y) => this.isBlocked(x, y),
			onPlacementArmed: () => this.hoverTile.setVisible(false),
		};
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
		const me = this.move.predicted;
		let best: number | null = null;
		let bestD = Infinity;
		for (const sid of this.store.serverIdsWith(Cat.Npc)) {
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

	private exitPlacement(): void {
		exitPlacementV(this.inv);
	}

	private updatePlaceGhost(tile: TileXY): void {
		updatePlaceGhostV(this.inv, this.invDeps(), tile);
	}

	private commitPlacement(tile: TileXY): void {
		commitPlacementV(this.inv, this.invDeps(), tile);
	}

	// HUD drag-and-drop dispatch: use a slot, drop it to the floor, or reorder.
	private handleInventoryIntent(intent: InventoryIntent): void {
		handleInventoryIntentV(this.inv, this.invDeps(), intent);
	}

	private tryAutoPickup(): void {
		tryAutoPickupV(this.inv, this.invDeps());
	}

	private applySnapshot(s: Snapshot) {
		for (const p of s.players) {
			this.slotUsername.set(p.slot, p.kbve_username);
		}
		const hadEid = this.myEid >= 0;
		const state: SyncState = {
			myEid: this.myEid,
			mySlot: this.mySlot,
			predicted: this.move.predicted,
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
		this.move.predicted = state.predicted;
		this.predictSeeded = state.predictSeeded;

		// Seed the float body when our entity first appears; thereafter soft-
		// correct it toward the server-authoritative tile so the client stays
		// smooth without drifting away from the server.
		if (!hadEid && this.myEid >= 0) {
			this.move.floatState = makeFloatState(
				state.serverPos ?? this.move.predicted,
			);
			this.refreshDungeon(this.move.predicted, true);
		} else if (this.myEid >= 0 && state.serverPos) {
			this.reconcilePlayer(
				state.serverPos,
				state.serverVel ?? { x: 0, y: 0 },
				state.inputAck ?? 0,
			);
			this.refreshDungeon(this.move.predicted);
		}
		this.refreshHud();
	}

	private reconcilePlayer(
		serverPos: TileXY,
		serverVel: TileXY,
		inputAck: number,
	) {
		reconcilePlayerV(
			this.move,
			this.moveDeps(),
			serverPos,
			serverVel,
			inputAck,
		);
	}

	private moveDeps(): MovementDeps {
		return {
			scene: this,
			client: () => this.client,
			localMode: () => this.localMode,
			dungeon: () => this.dungeon,
			gateGraph: this.gateGraph,
			isBlocked: (x, y) => this.isBlocked(x, y),
			cursors: this.cursors,
			wasd: this.wasd,
			combat: this.combat,
			refreshDungeon: (tile) => this.refreshDungeon(tile),
		};
	}

	private onCombat(c: CombatEvent) {
		onCombatV(this.combat, this.combatDeps(), c);
	}

	private combatDeps(): CombatDeps {
		return {
			scene: this,
			store: this.store,
			client: () => this.client,
			myEid: () => this.myEid,
			localMode: () => this.localMode,
			floatPos: () => this.move.floatState.pos,
			isHostile: (eid) => this.isHostileServer(eid),
			clearMovePath: () => {
				this.move.movePath = [];
			},
			refreshHud: () => this.refreshHud(),
			destroyRefs: (refs) => this.destroyRefs(refs),
		};
	}

	/** Tear down an entity's display objects. */
	private destroyRefs(refs: EntityRefs) {
		destroyRefsV(refs);
	}

	/**
	 * The local player took a stair: the server moved us to a new dungeon floor.
	 * Snap the float body to the destination tile, switch the active floor (so
	 * collision + rendering use the new layout), and re-stream the dungeon. The
	 * dungeon field is rebuilt for the new z.
	 */
	private onFloorChange(f: FloorChangeEvent) {
		this.currentFloor = f.z;
		this.move.predicted = { x: f.tile.x, y: f.tile.y };
		this.move.floatState = makeFloatState(this.move.predicted);
		this.dungeon = new DungeonField(
			floorSeed(DUNGEON_SEED, f.z),
			DUNGEON_RADIUS,
		);
		resetHudMap(this.hud);
		this.rebuildDungeon();
		this.placeStairs();
	}

	/**
	 * Offline-only floor change (no server). Mirrors the server stair link:
	 * ascending (dz=+1) lands on the target floor's Down stair, descending
	 * (dz=-1) lands on its Up stair, so the local player arrives on a real tile.
	 * Lets us test the grass surface (z>=0) and dungeon (z<0) without a server.
	 */
	private debugChangeFloor(dz: number) {
		const z = this.currentFloor + dz;
		// Surface cap: z>0 (cities/above-ground) isn't built yet — going up past
		// the grass surface leads nowhere. Mirrors the server's Stairs::at cap.
		if (z > 0) {
			this.flashMessage('These stairs seem to go nowhere?!');
			return;
		}
		const land = dz < 0 ? StairKind.Up : StairKind.Down;
		const tile = stairTile(floorSeed(DUNGEON_SEED, z), land);
		this.onFloorChange({ z, tile });
	}

	/**
	 * The surface up-stair (z=0 -> z+1) is a dead end until cities/above-ground
	 * floors exist. When the player stands on it, flash a one-shot notice — the
	 * server won't move them (Stairs::at caps ascent at z=0), so without this the
	 * stair would just silently do nothing.
	 */
	private checkDeadStair() {
		if (this.currentFloor < 0) {
			this.deadStairTile = null;
			return;
		}
		const t = floatTile(this.move.floatState);
		const up = stairTile(
			floorSeed(DUNGEON_SEED, this.currentFloor),
			StairKind.Up,
		);
		const key = `${up.x},${up.y}`;
		if (t.x === up.x && t.y === up.y) {
			if (this.deadStairTile !== key) {
				this.deadStairTile = key;
				this.flashMessage('These stairs seem to go nowhere?!');
			}
		} else if (this.deadStairTile === key) {
			this.deadStairTile = null; // stepped off — allow it to fire again
		}
	}

	/** One-shot on-screen notice via laser's global `notification` event. */
	private flashMessage(text: string) {
		emitNotification({ title: '', message: text });
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

		this.checkDeadStair();
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
			floatState: this.move.floatState,
			dungeon: this.dungeon,
			myEid: this.myEid,
			surface: this.isSurface(),
			playerName: this.localPlayerName(),
		};
	}

	private tickLocalMotion(refs: EntityRefs, deltaMs: number) {
		tickLocalMotionV(this.move, this.moveDeps(), refs, deltaMs);
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
				if (DEBUG_CREATURE_DIRS) drawCreatureDebugV(refs);
			}
		}
	}

	/**
	 * Click-move: hierarchical route from the body's tile to the clicked tile.
	 * The gate graph picks the room-to-room chunk route and tile A* refines each
	 * leg, so long cross-dungeon clicks stay cheap and follow corridor centers
	 * instead of straight-lining into a wall. No path = no move.
	 */
	private startMoveTo(tile: TileXY) {
		startMoveToV(this.move, this.moveDeps(), tile);
	}

	// Tiles occupied by env objects (campfire, …), rebuilt once per frame from the
	// ECS store so local prediction blocks the same tiles the server does — else
	// the player walks onto a campfire then snaps back on the next snapshot.
	private envBlocked = new Set<number>();
	// Set by netSync on any env spawn/despawn/move; the set is rebuilt on the next
	// frame instead of every frame. Starts dirty so the first snapshot seeds it.
	private envDirty = true;

	private markEnvDirty = (): void => {
		this.envDirty = true;
	};

	private refreshEnvBlocked(): void {
		this.envBlocked.clear();
		for (const sid of this.store.serverIdsWith(Cat.Env)) {
			const t = this.store.tile(sid);
			if (t) this.envBlocked.add(packTile(t.x, t.y));
		}
	}

	// Endless dungeon: a tile is walkable iff it's a generated floor tile AND not
	// occupied by an env blocker. No fixed bounds — walls are the absence of floor.
	private isBlocked = (x: number, y: number): boolean => {
		if (this.isSurface()) return this.envBlocked.has(packTile(x, y));
		return (
			!this.dungeon.isFloor(x, y) || this.envBlocked.has(packTile(x, y))
		);
	};

	private isHostileServer(serverEid: number): boolean {
		const kind = this.store.kind(serverEid);
		return kind >= 0 && this.syncResolvers.hostile(kind);
	}

	private placeSprite(sprite: EntityRefs['sprite'], tx: number, ty: number) {
		placeSpriteV(this, sprite, tx, ty);
	}

	private placeRefs(refs: EntityRefs, tile: TileXY) {
		placeRefsV(this, refs, tile);
	}

	private syncShadow(refs: EntityRefs) {
		syncShadowV(refs);
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
			cat: Cat.Player,
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
				cat: Cat.Player,
				owner: 0,
				hostile: false,
				hp: 100,
				maxHp: 100,
			},
			refs,
		);
		this.myEid = LOCAL_PLAYER_EID;
		this.move.predicted = { ...tile };
		this.predictSeeded = true;
		this.move.floatState = makeFloatState(tile);
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
		spawnLocalItemV(this.inv, this.invDeps(), eid, ref, count, tile);
	}

	/**
	 * Fire the ranger's bow at a world tile: Draw windup -> Loose -> arrow. The
	 * shot is gated so you can't re-fire mid-draw, and it cancels any active
	 * click-move (you plant to shoot). Online the server is authoritative;
	 * offline the hit is applied locally.
	 */
	private fireBowAt(aim: TileXY, target?: number) {
		fireBowAtV(this.combat, this.combatDeps(), aim, target);
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
		placeNameplateV(refs);
	}

	private refreshHud() {
		const now = this.time.now;
		for (const [serverEid, , refs] of this.store.entries()) {
			const hp = this.store.hp(serverEid);
			const maxHp = this.store.maxHp(serverEid);

			if (refs.statusFx) {
				drawStatusFxV(refs, this.store.effects(serverEid), now);
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

	private teardown() {
		this.offIntent?.();
		this.offIntent = undefined;
		this.client?.close();
		this.client = null;
		clearHud();
	}
}
