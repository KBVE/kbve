import Phaser from 'phaser';
import {
	GameClient,
	ACTION_ATTACK,
	attachCameraZoom,
	flashEntity,
	floatingText,
	drawHealthBar,
	type EntityDelta,
	type KindEntry,
	type Snapshot,
	type Welcome,
	type CombatEvent,
	type ProjectileEvent,
	type FloorChangeEvent,
	type Facing,
	type InventorySync,
	type InventoryItem,
} from '@kbve/laser';
import {
	COLORS,
	TILE_W,
	TILE_H,
	MOVE_TWEEN_MS,
	WALK_SPEED,
	RUN_SPEED,
	ARRIVE_DIST,
	WAYPOINT_REACH,
	HEARTBEAT_MS,
	DEPTH_TILE,
	DEPTH_ENTITY_BASE,
	DEPTH_UI,
	DEPTH_PROJECTILE,
	ARROW_SPEED,
	BOW_MUZZLE_HEIGHT,
	arpgAsset,
	GROUND_TEXTURE_KEY,
	GROUND_TEXTURE_PATH,
	DUNGEON_SEED,
	DUNGEON_RADIUS,
	FOG_ZOOM_OUT,
	FOG_ZOOM_IN,
	FOG_MAX_STRENGTH,
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
import { EntityStore } from './ecs/store';
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
	tileStepDir,
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
} from './systems/dungeon';
import { findHierPath, type GateGraph } from './systems/pathfind';
import { fireBow, showDamage, type BowShot } from './combat/bow';
import { emitHud, clearHud, emitInventory } from './systems/hud';
import { facingDegFromDelta } from './entities/classes';
import {
	makeSprite,
	makeClassSprite,
	makeNameplate,
	setClassPose,
	tickClassFacing,
	isPlayerKind,
	type EntityRefs,
} from './entities/sprites';
import {
	preloadClass,
	registerClassAnims,
	RANGER_CLASS,
} from './entities/classes';
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
	private chunkGrounds = new Map<string, Phaser.GameObjects.Container>();
	private holeLayer!: Phaser.GameObjects.Graphics;
	private fog?: Phaser.GameObjects.Image;
	private fogVignette?: Phaser.Filters.Vignette;
	private lastChunkKey = '';
	private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
	private wasd!: Record<
		'up' | 'down' | 'left' | 'right',
		Phaser.Input.Keyboard.Key
	>;

	private netReady = false;
	private mySlot = -1;
	private myEid = -1;
	private predicted: TileXY = { x: 0, y: 0 };
	private predictSeeded = false;
	private floatState: FloatState = makeFloatState({ x: 0, y: 0 });
	// Click-move route: A* waypoints (smoothed), consumed front-to-back. Empty =
	// no active click move. Keyboard input clears it.
	private movePath: TileXY[] = [];
	private bowShot: BowShot | null = null;
	private fireKey!: Phaser.Input.Keyboard.Key;
	// HUD emits are throttled to ~15/s; this accumulates frame time between emits.
	private hudAccum = 0;
	// Last movement heading (screen deg, 0=N CW); held while idle so the compass
	// needle doesn't snap back when the player stops.
	private hudHeadingDeg = 0;
	// Last cardinal facing sent to the server, so face() only fires on change.
	private lastSentFacing: Facing | null = null;
	// Dungeon floor the local player is on (z). Server-authoritative via the
	// `floor` event; snapshot entities on other floors are not rendered.
	private currentFloor = 0;

	// Latest server-authoritative inventory (from EPHEMERAL_INVENTORY). Drives the
	// HUD panel and the 1-9 hotkeys.
	private inventory: InventoryItem[] = [];

	private syncBridge!: SyncBridge<EntityRefs>;
	private syncResolvers!: SyncResolvers;
	private hoverTile!: Phaser.GameObjects.Graphics;
	private localMode = false;

	constructor() {
		super({ key: 'IsoArpgScene' });
	}

	preload() {
		this.load.image(GROUND_TEXTURE_KEY, arpgAsset(GROUND_TEXTURE_PATH));
		preloadClass(this, RANGER_CLASS);
		for (const def of ENV_REGISTRY.values()) preloadEnv(this, def);
	}

	create() {
		this.cameras.main.setBackgroundColor(COLORS.background);
		this.kinds = makeKindResolvers(this.kindRegistry);
		registerClassAnims(this, RANGER_CLASS);
		for (const def of ENV_REGISTRY.values()) registerEnvAnims(this, def);

		this.drawGrid();
		this.buildFog();
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

		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
	}

	private drawGrid() {
		// Static base ground: one non-repeating texture laid on the iso plane.
		// It is just the backdrop — the dungeon's room/corridor look is a
		// separate tile eco-system drawn ON TOP later. The DungeonField still
		// drives walkability + streaming; it does NOT carve this base.
		this.buildGroundPlane();
		this.refreshDungeon(DEBUG_SPAWN_TILE, true);
		this.hoverTile = this.makeHoverTile();
	}

	private buildGroundPlane() {
		// Black diamonds punched over every non-floor tile, above the ground but
		// below entities — the dungeon's room/corridor shape reads as the holes
		// in the tiled ground.
		this.holeLayer = this.add.graphics().setDepth(DEPTH_TILE + 1);
	}

	/**
	 * Distance fog. On WebGL it uses Phaser 4's built-in per-pixel Vignette
	 * camera filter (GPU, the right hook for richer fog / fog-of-war later). On
	 * the canvas renderer (no filters) it falls back to a radial vignette image
	 * locked to the camera. Either way: clear around the player, fogged toward
	 * the streaming boundary instead of a hard void cliff. The fog only matters
	 * when zoomed OUT (the void edge is visible); zoomed in it fades away —
	 * driven by syncFogToZoom().
	 */
	private buildFog() {
		if (this.renderer.type === Phaser.WEBGL) {
			this.fogVignette = this.cameras.main.filters.internal.addVignette(
				0.5,
				0.5,
				0.62,
				0,
				0x05070d,
			);
			this.syncFogToZoom();
			return;
		}
		this.buildFogVignette();
	}

	/** Canvas-renderer fallback: a radial gradient vignette over the viewport. */
	private buildFogVignette() {
		const key = 'arpg-fog-radial';
		if (!this.textures.exists(key)) {
			const size = 512;
			const tex = this.textures.createCanvas(key, size, size);
			const ctx = tex!.getContext();
			const r = size / 2;
			const grad = ctx.createRadialGradient(r, r, r * 0.42, r, r, r);
			grad.addColorStop(0, 'rgba(8,9,14,0)');
			grad.addColorStop(0.7, 'rgba(8,9,14,0.55)');
			grad.addColorStop(1, 'rgba(8,9,14,1)');
			ctx.fillStyle = grad;
			ctx.fillRect(0, 0, size, size);
			tex!.refresh();
		}

		this.fog = this.add
			.image(0, 0, key)
			.setOrigin(0.5, 0.5)
			.setScrollFactor(0)
			.setDepth(DEPTH_UI - 1);
		this.sizeFog();
		this.scale.on(Phaser.Scale.Events.RESIZE, this.sizeFog, this);
	}

	/** Stretch the fog vignette to blanket the whole viewport, centred. */
	private sizeFog() {
		if (!this.fog) return;
		const cam = this.cameras.main;
		const w = cam.width;
		const h = cam.height;
		// Overscale so the opaque rim always reaches past the corners.
		const span = Math.hypot(w, h) * 1.15;
		this.fog.setPosition(w / 2, h / 2);
		this.fog.setDisplaySize(span, span);
	}

	/**
	 * Fog only matters when zoomed OUT, where the streamed void boundary comes
	 * into view; zoomed in the screen is tight and fog just dims the scene. Map
	 * zoom -> fog strength: full at FOG_ZOOM_OUT, fading to none by FOG_ZOOM_IN.
	 * The canvas fallback image's alpha rides the same curve.
	 */
	private syncFogToZoom() {
		const zoom = this.cameras.main.zoom;
		const t = Phaser.Math.Clamp(
			(FOG_ZOOM_IN - zoom) / (FOG_ZOOM_IN - FOG_ZOOM_OUT),
			0,
			1,
		);
		const strength = t * FOG_MAX_STRENGTH;
		if (this.fogVignette) this.fogVignette.strength = strength;
		if (this.fog) this.fog.setAlpha(t);
	}

	/**
	 * Stream the dungeon window to `focus` on a chunk change: regenerate the
	 * field, build a WORLD-anchored ground tile for each newly-entered chunk,
	 * unload the ones left behind, and repaint the hole diamonds. Each chunk's
	 * ground is fixed at its own world origin, so nothing slides as the player
	 * walks — areas simply load ahead and unload behind. `force` runs on build.
	 */
	private refreshDungeon(focus: TileXY, force = false) {
		const { cx, cy } = chunkOf(focus.x, focus.y);
		const ckey = `${cx}:${cy}`;
		if (!force && ckey === this.lastChunkKey) return;
		this.lastChunkKey = ckey;

		const { added, removed } = this.dungeon.refresh(focus);
		for (const c of added) this.buildChunkGround(c.cx, c.cy);
		for (const c of removed) this.unloadChunkGround(c.cx, c.cy);
		this.paintHoles(cx, cy);
	}

	/**
	 * Hard reset of the rendered dungeon — used on a floor change, where the
	 * whole layout is replaced (a fresh `this.dungeon` was assigned). Tear down
	 * every chunk ground, clear holes, and force a re-stream around the new
	 * position.
	 */
	private rebuildDungeon() {
		for (const plane of this.chunkGrounds.values()) plane.destroy();
		this.chunkGrounds.clear();
		this.lastChunkKey = '';
		this.refreshDungeon(this.predicted, true);
	}

	/**
	 * One world-anchored ground tile for a chunk: a TileSprite covering the
	 * chunk's tile square, projected onto the iso plane (inner sprite rotated
	 * 45°, parent Container squashed 2:1 — Phaser scales before it rotates, so a
	 * lone sprite can't be projected directly) and pinned at the chunk's world
	 * centre. Fixed in world space → the texture never slides.
	 */
	private buildChunkGround(cx: number, cy: number) {
		const key = `${cx}:${cy}`;
		if (this.chunkGrounds.has(key)) return;
		const side = CHUNK_SIZE * TILE_W + TILE_W * 2;
		const sprite = this.add.tileSprite(
			0,
			0,
			side,
			side,
			GROUND_TEXTURE_KEY,
		);
		sprite.setOrigin(0.5, 0.5);
		sprite.setRotation(-Math.PI / 4);

		// World centre of the chunk's tile square.
		const midX = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
		const midY = cy * CHUNK_SIZE + CHUNK_SIZE / 2;
		const c = worldToScreen(midX, midY);
		const plane = this.add.container(c.x, c.y, [sprite]);
		plane.setScale(1, 0.5);
		plane.setDepth(DEPTH_TILE);

		// Phase the texture by the chunk's screen centre rotated into the
		// sprite's own (un-rotated) frame, so every chunk samples one continuous
		// texture — borders between chunk grounds blend with no visible seam.
		const cos = Math.cos(Math.PI / 4);
		const sin = Math.sin(Math.PI / 4);
		const ux = c.x;
		const uy = c.y / 0.5;
		sprite.tilePositionX = ux * cos - uy * sin;
		sprite.tilePositionY = ux * sin + uy * cos;
		this.chunkGrounds.set(key, plane);
	}

	private unloadChunkGround(cx: number, cy: number) {
		const key = `${cx}:${cy}`;
		this.chunkGrounds.get(key)?.destroy();
		this.chunkGrounds.delete(key);
	}

	/**
	 * Repaint the hole layer: a black iso diamond on every non-floor tile in the
	 * live chunk window. Painting holes (sparse walls) rather than floors keeps
	 * the tiled ground texture intact underneath the walkable space.
	 */
	private paintHoles(cx: number, cy: number) {
		const g = this.holeLayer;
		g.clear();
		g.fillStyle(0x05070d, 1);
		const hw = TILE_W / 2;
		const hh = TILE_H / 2;
		const r = DUNGEON_RADIUS;
		const minX = (cx - r) * CHUNK_SIZE;
		const minY = (cy - r) * CHUNK_SIZE;
		const maxX = (cx + r + 1) * CHUNK_SIZE;
		const maxY = (cy + r + 1) * CHUNK_SIZE;
		for (let y = minY; y < maxY; y++) {
			for (let x = minX; x < maxX; x++) {
				if (this.dungeon.isFloor(x, y)) continue;
				const p = worldToScreen(x, y);
				g.beginPath();
				g.moveTo(p.x, p.y - hh);
				g.lineTo(p.x + hw, p.y);
				g.lineTo(p.x, p.y + hh);
				g.lineTo(p.x - hw, p.y);
				g.closePath();
				g.fillPath();
			}
		}
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
		// Number keys 1-9 use the matching inventory slot.
		kb.on('keydown', (ev: KeyboardEvent) => {
			if (ev.key >= '1' && ev.key <= '9') {
				this.useInventorySlot(Number(ev.key) - 1);
			}
		});
		this.input.mouse?.disableContextMenu();

		this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
			const aim = screenToWorldF(pointer.worldX, pointer.worldY);
			const tile = { x: Math.round(aim.x), y: Math.round(aim.y) };

			// Right button = fire the bow at the cursor (left = move/attack).
			if (pointer.rightButtonDown()) {
				this.fireBowAt(aim);
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

		this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
			const tile = screenToWorld(pointer.worldX, pointer.worldY);
			if (this.isBlocked(tile.x, tile.y)) {
				this.hoverTile.setVisible(false);
				return;
			}
			const p = worldToScreen(tile.x, tile.y);
			this.hoverTile.setPosition(p.x, p.y).setVisible(true);
		});
	}

	private buildBridge() {
		this.syncBridge = {
			create: (e: EntityDelta, label) => {
				let refs: EntityRefs;
				if (isPlayerKind(this.kinds, e.kind)) {
					refs = this.makePlayerRefs(e.kind);
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
				if (label) {
					refs.nameplate = makeNameplate(this, label);
					this.placeNameplate(refs);
				}
				refs.hpBar = this.add.graphics().setDepth(DEPTH_UI);
				return refs;
			},
			move: (refs, tile) => this.tweenTo(refs, tile, true),
			setPos: (refs, tile) => this.placeRefs(refs, tile),
			follow: (refs) =>
				this.cameras.main.startFollow(refs.sprite, true, 0.12, 0.12),
			remove: (refs) => {
				refs.shadow?.destroy();
				refs.nameplate?.destroy();
				refs.hpBar?.destroy();
				refs.sprite.destroy();
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
		client.on('projectile', (p: ProjectileEvent) => this.onProjectile(p));
		client.on('floor', (f: FloorChangeEvent) => this.onFloorChange(f));
		client.on('inventory', (inv: InventorySync) => {
			this.inventory = inv.items;
			emitInventory(inv.items);
		});

		client.connect();
	}

	// Use the item in inventory slot `idx` (0-based), bound to keys 1-9. The
	// server consumes it and applies the effect (heal/buff); the resulting
	// EPHEMERAL_INVENTORY refreshes the HUD.
	private useInventorySlot(idx: number): void {
		const item = this.inventory[idx];
		if (item) this.client?.useItem(item.ref);
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
		);
		this.myEid = state.myEid;
		this.predicted = state.predicted;
		this.predictSeeded = state.predictSeeded;

		// Seed the float body when our entity first appears; thereafter soft-
		// correct it toward the server-authoritative tile so the client stays
		// smooth without drifting away from the server.
		if (!hadEid && this.myEid >= 0) {
			this.floatState = makeFloatState(this.predicted);
			this.refreshDungeon(this.predicted, true);
		} else if (this.myEid >= 0) {
			reconcileFloat(this.floatState, this.predicted);
			this.refreshDungeon(this.predicted);
		}
		this.refreshHud();
	}

	private onCombat(c: CombatEvent) {
		const refs = this.store.refs(c.target);
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
	}

	/**
	 * Server-authoritative arrow: the server fired a projectile, so fly the
	 * visual from its origin to its endpoint. Online this replaces the local
	 * tween (which only runs in offline localMode); damage rides the separate
	 * Combat event.
	 */
	private onProjectile(p: ProjectileEvent) {
		const a = worldToScreen(p.from.x, p.from.y);
		a.y -= BOW_MUZZLE_HEIGHT;
		const b = worldToScreen(p.to.x, p.to.y);
		b.y -= BOW_MUZZLE_HEIGHT;
		const arrow = this.add.rectangle(a.x, a.y, 16, 3, 0xfde68a);
		arrow.setStrokeStyle(1, 0x78350f, 0.9);
		arrow.setDepth(DEPTH_PROJECTILE);
		arrow.setRotation(Math.atan2(b.y - a.y, b.x - a.x));
		const dist = Math.hypot(b.x - a.x, b.y - a.y);
		this.tweens.add({
			targets: arrow,
			x: b.x,
			y: b.y,
			duration: (dist / (ARROW_SPEED * TILE_W)) * 1000,
			ease: 'Linear',
			onComplete: () => arrow.destroy(),
		});
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
		this.rebuildDungeon();
	}

	update(time: number, delta: number) {
		// Smooth facing runs every frame (independent of the movement sim) so
		// the 16-dir turn curve stays fluid even between tile crossings.
		this.tickFacing();
		this.syncFogToZoom();
		this.refreshEnvBlocked();

		if ((!this.client && !this.localMode) || !this.predictSeeded) return;

		// Space fires the bow toward the cursor.
		if (Phaser.Input.Keyboard.JustDown(this.fireKey)) {
			const ptr = this.input.activePointer;
			this.fireBowAt(screenToWorldF(ptr.worldX, ptr.worldY));
		}

		const myRefs = this.store.refs(this.myEid);
		if (myRefs) this.tickLocalMotion(myRefs, delta);

		this.tickHud(delta);
	}

	/**
	 * Push player vitals + the movement-driven compass heading to the React HUD
	 * over the laser event bus, throttled to ~15 Hz. The compass tracks the float
	 * body's VELOCITY (where the character is actually walking), not the cursor —
	 * heading holds its last value while standing still so the needle doesn't
	 * snap back to north on every stop.
	 */
	private tickHud(deltaMs: number) {
		this.hudAccum += deltaMs;
		if (this.hudAccum < 66) return;
		this.hudAccum = 0;

		const vel = this.floatState.vel;
		const moving = Math.hypot(vel.x, vel.y) > 0.05;
		if (moving) this.hudHeadingDeg = facingDegFromDelta(vel.x, vel.y);

		const tile = floatTile(this.floatState);
		emitHud({
			name: this.localPlayerName(),
			hp: this.store.hp(this.myEid),
			maxHp: this.store.maxHp(this.myEid),
			headingDeg: this.hudHeadingDeg,
			moving,
			fps: Math.round(this.game.loop.actualFps),
			tile,
		});
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
			this.refreshDungeon(tile); // stream chunks as the player advances
			const dir = tileStepDir(prevTile, tile);
			if (dir) {
				this.client?.step(dir);
				this.sendFacing(dir); // movement also sets cardinal facing
			}
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

	/** Lerp every class entity's facing toward its movement target this frame. */
	private tickFacing() {
		for (const [, , refs] of this.store.entries()) {
			if (refs.cls && refs.sprite instanceof Phaser.GameObjects.Sprite) {
				tickClassFacing(refs.sprite, refs.cls);
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
		this.client?.moveTo(tile);
	}

	// Tiles occupied by env objects (campfire, …), rebuilt once per frame from the
	// ECS store so local prediction blocks the same tiles the server does — else
	// the player walks onto a campfire then snaps back on the next snapshot.
	private envBlocked = new Set<string>();

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
		// Fractional origin + aim so the facing direction and arrow line are
		// precise (rounding both to tiles flipped the angle at close range).
		const from = { x: this.floatState.pos.x, y: this.floatState.pos.y };
		// Tell the server to shoot — at the explicitly-clicked enemy if any,
		// else null (the server resolves what the aim line hits). The arrow
		// visual + damage are server-authoritative online; the local arrow is
		// only resolved client-side in offline localMode.
		this.client?.action(ACTION_ATTACK, target ?? null);
		this.bowShot = fireBow(
			this,
			refs.sprite,
			refs.cls,
			from,
			aim,
			(tx, ty) => this.arrowHitTest(tx, ty),
			(serverEid, dmg) => {
				// Offline only: fake the hit locally. Online, the server's
				// Combat/Projectile events drive damage + the arrow.
				if (this.localMode) this.applyLocalHit(serverEid, dmg);
			},
		);
	}

	/** Arrow hit-test: first non-self entity occupying the tile, else miss. */
	private arrowHitTest(tx: number, ty: number) {
		const hit = this.store.at(tx, ty, this.myEid);
		if (!hit) return null;
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
		}

		this.tweens.add({
			targets: refs.sprite,
			x: p.x,
			y: p.y + 8,
			duration: MOVE_TWEEN_MS,
			ease: 'Linear',
			onUpdate: () => {
				this.placeNameplate(refs);
				this.syncShadow(refs);
			},
			onComplete: settle ? () => this.settleRemoteIdle(refs) : undefined,
		});
	}

	/**
	 * Remote movers aren't input-driven, so settle them to Idle when their last
	 * step tween ends and no follow-up tween chained on. The local player is
	 * float-driven and settles itself in tickLocalMotion.
	 */
	private settleRemoteIdle(refs: EntityRefs) {
		if (!refs.cls || !(refs.sprite instanceof Phaser.GameObjects.Sprite))
			return;
		if (refs.cls.state !== 'Run') return;
		if (this.tweens.isTweening(refs.sprite)) return;
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
		for (const [serverEid, , refs] of this.store.entries()) {
			const hp = this.store.hp(serverEid);
			const maxHp = this.store.maxHp(serverEid);

			if (
				refs.cls &&
				refs.sprite instanceof Phaser.GameObjects.Sprite &&
				hp <= 0 &&
				refs.cls.state !== 'Death'
			) {
				setClassPose(refs.sprite, refs.cls, 'Death');
			}

			if (!refs.hpBar) continue;
			if (maxHp <= 0 || hp >= maxHp) {
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
		this.client?.close();
		this.client = null;
		clearHud();
	}
}
