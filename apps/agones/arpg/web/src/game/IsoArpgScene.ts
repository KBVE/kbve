import Phaser from 'phaser';
import {
	GameClient,
	PROTOCOL_VERSION,
	drawHealthBar,
	drawHealthBarCached,
	type EntityDelta,
	type KindEntry,
	type Snapshot,
	type Welcome,
	type CombatEvent,
	type ProjectileEvent,
	type FloorChangeEvent,
	type InventorySync,
	type ItemPlacedEvent,
	type CorpseContents,
	ACTION_LOOT,
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
	BIOMES,
	biomeTextureKey,
	biomeTexturePath,
	USE_GROUND_SHADER,
	SURFACE_MIN_Z,
	DUNGEON_SEED,
	DUNGEON_RADIUS,
	BODY_RADIUS,
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
import { preloadCursors } from './input/cursor';
import { getInputRouter, type InputRouter } from './input/input-router';
import {
	createDefaultContextStack,
	InputContextId,
	type InputContextStack,
} from './input/input-context';
import { KeyboardDevice, isTextInputFocused } from './input/devices/keyboard';
import { Action } from './input/actions';
import { emitChatToggle, onChatFocus, emitDeath } from './systems/hud';
import {
	makeFogState,
	buildFog,
	syncFogToZoom,
	type FogState,
} from './systems/fog';
import {
	makeGroundShader,
	type GroundShaderHandle,
} from './systems/groundShader';
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
	rotatePlacement as rotatePlacementV,
	updatePlaceGhost as updatePlaceGhostV,
	commitPlacement as commitPlacementV,
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
import {
	makeSpellState,
	initSpellLoadout as initSpellLoadoutV,
	castSpellSlot as castSpellSlotV,
	type SpellState,
	type SpellDeps,
} from './systems/spells';
import {
	tickCreatureInterp as tickCreatureInterpV,
	tickPlayerInterp as tickPlayerInterpV,
	tickFacing as tickFacingV,
} from './systems/creatureView';
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
	emitNotification,
	emitBoot,
	emitConnection,
	emitPlayers,
	onInventoryIntent,
	type InventoryIntent,
	emitCorpseOpen,
	onCorpseIntent,
	emitSpaceEnter,
	onSpaceExit,
} from './systems/hud';
import {
	makeSprite,
	makeClassSprite,
	makeCorpseSprite,
	CORPSE_REF,
	makeCreatureSprite,
	resetCreaturePose,
	resetCreatureShadow,
	makeNameplate,
	setClassPose,
	setCreaturePose,
	isPlayerKind,
	type EntityRefs,
} from './entities/sprites';
import { CreaturePool } from './systems/creaturePool';
import {
	preloadClass,
	registerClassAnims,
	RANGER_CLASS,
} from './entities/classes';
import {
	preloadCreature,
	registerCreatureAnims,
	isCreatureLoaded,
	unloadCreature,
	DEBUG_CREATURE_DIRS,
	type CreatureDef,
} from './entities/creatures';
import {
	TextureResidency,
	type TextureResource,
} from './systems/textureResidency';
import { newInterp, pushSample, resetInterp } from './systems/interp';
import {
	preloadEnv,
	registerEnvAnims,
	makeEnvSprite,
	attachEnvLight,
	ENV_REGISTRY,
	SHIP_REF,
	shipFootprint,
	shipHull,
	resolveShipHull,
} from './entities/env';
import {
	preloadShip,
	registerShipAnims,
	ShipController,
	SHIP_PHASE_TO_STATE,
	shipFacingFromSub,
	shipFacing16,
	shipPhaseFromSub,
} from './entities/ship';
import {
	preloadTrees,
	makeTreeSprite,
	reskinTreeSprite,
	fellTreeSprite,
	decodeTreeSub,
	treeAt,
	TREE_REF,
} from './entities/trees';
import { flyRemoteArrow } from './entities/projectiles/arrows/bow';
import { getNetConfig } from './net-config';
import { resolvePlayerName } from './playerName';

// Ship collision debug overlay: cyan = server-intended footprint diamond (the
// shared `shipFootprint` shape from the ship's authoritative tile), red = the tiles
// the client `envBlocked` set actually blocks. Aligned → red fills nest in cyan
// outlines. Flip off to drop the overlay.
const DEBUG_SHIP_COLLISION = false;

export class IsoArpgScene extends Phaser.Scene {
	private client: GameClient | null = null;
	private store = new EntityStore<EntityRefs>();
	private kindRegistry = new Map<number, KindEntry>();
	private kinds!: KindResolvers;
	private slotUsername = new Map<number, string>();

	// Reuse pool for streamed creature sprites (predators cull/respawn constantly).
	private creaturePool = new CreaturePool();
	// Lazy GPU-texture residency: creature sheets load on first spawn and free a
	// grace period after the last instance is culled, so VRAM tracks what's on
	// screen rather than the whole creature catalog.
	private residency = new TextureResidency(this);
	private creatureResources = new Map<string, TextureResource>();

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
	private ground?: GroundShaderHandle;
	// Eased zoom: wheel/keys nudge zoomTarget, update() smooth-damps the camera
	// toward it (critically-damped spring) so zoom accelerates then settles instead
	// of snapping. SMOOTH_TIME ~ time to converge; MAX_SPEED caps the glide rate.
	private zoomTarget = 1;
	private zoomVel = 0;
	private static readonly ZOOM_MIN = 0.5;
	private static readonly ZOOM_MAX = 2.0;
	private static readonly ZOOM_STEP = 0.1;
	private static readonly ZOOM_MAX_LEAD = 0.35;
	private static readonly ZOOM_SMOOTH_TIME = 0.28;
	private static readonly ZOOM_MAX_SPEED = 6.0;
	// Kept only for the Shift (walk-tier) read; direction now flows through the
	// input router. WASD/arrows are bound on the keyboard device.
	private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

	// True once the local player has spawned in-world: routes connection-state
	// changes to the in-game reconnect banner instead of the boot overlay.
	private bootReady = false;
	private static readonly MAX_RECONNECTS = 3;
	// Tiles of single-snapshot movement past which an interp update is treated as a
	// discontinuity (teleport/AOI re-entry) and snapped, not splined across.
	private static readonly INTERP_SNAP_DIST = 4;
	private mySlot = -1;
	private myEid = -1;
	private predictSeeded = false;
	// Local player kinematic model: float body, click route, predicted tile,
	// move-send throttle. Shared with combat/hud/inventory.
	private move: MovementState = makeMovementState({ x: 0, y: 0 });
	// Bow-shot bookkeeping: in-flight arrow, deferred server hits, corpses.
	private combat: CombatState = makeCombatState();
	private fireKey!: Phaser.Input.Keyboard.Key;
	// Central input: a keyboard device feeds the router (movement, ToggleChat, …);
	// the context stack gates actions per mode (Gameplay / Chat). Polled + cleared
	// each frame in update().
	private inputRouter: InputRouter = getInputRouter();
	private inputCtx: InputContextStack = createDefaultContextStack();
	private kbDevice?: KeyboardDevice;
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
	// Same one-shot guard for the surface down-stair: flash the PvP/danger notice
	// once per step-on as the player is about to descend into the dungeon.
	private downStairWarnTile: string | null = null;
	// Lazily-built graphics layer for the ship collision debug overlay.
	private shipDbg?: Phaser.GameObjects.Graphics;
	// Per-frame OBB overlay + whether the push-out is currently firing (debug).
	private shipObbDbg?: Phaser.GameObjects.Graphics;
	private shipPushing = false;
	// Ship facing (sub/FurnitureRot 0..15) per server eid — drives the per-facing
	// collision footprint. The store doesn't retain `sub`, so capture it on sync.
	private shipFacing = new Map<number, number>();
	// Stateful pilot rig per ship eid (replaces the static env sprite for SHIP_REF).
	// Driven authoritatively from the snapshot (ship `sub` phase) by reconcileShips.
	private shipCtl = new Map<number, ShipController>();
	// Base tile per ship eid, for the proximity "enter" prompt.
	private shipTile = new Map<number, { x: number; y: number }>();
	// Player eid → ship eid they pilot (server-authoritative, from delta.piloting).
	// Drives body-hide + nameplate-over-ship for EVERY client. Applied per frame.
	private pilots = new Map<number, number>();
	// Whether the LOCAL player is piloting (derived from `pilots`); gates the prompt.
	private localPiloting = false;
	// Ships currently airborne (phase != off). An airborne ship tile-blocks nothing
	// (mirrors the server) — its pilot would otherwise collide with its own hull.
	private flyingShips = new Set<number>();
	// What the camera is following: the on-foot body, or the ship while piloting.
	private camFollowing: 'player' | 'ship' = 'player';
	// Pilot-steering debug overlay (compass + live movement/facing arrows). Lazy.
	private pilotDbgG?: Phaser.GameObjects.Graphics;
	private pilotDbgText: Phaser.GameObjects.Text[] = [];
	// Latest streamed sub-tile pos per ship eid (qx/qy ÷ POS_SCALE), for smooth flight:
	// the local pilot's ship rides the predicted body, remote ships lerp toward this.
	private shipPos = new Map<number, { x: number; y: number }>();
	// The exact game object handed to startFollow — tracked so we can detect when it
	// gets destroyed (ship/body goes off-grid into space) and stop following a dead one.
	private camFollowTarget?:
		| Phaser.GameObjects.Sprite
		| Phaser.GameObjects.Rectangle;
	// Lazy in-world "Enter Ship" prompt shown when the local player stands near a ship.
	private shipPrompt?: Phaser.GameObjects.Container;
	// How close (tiles, Chebyshev) the player must be to a ship to pilot it.
	private static readonly SHIP_ENTER_RANGE = 3;

	// Latest server-authoritative inventory (from EPHEMERAL_INVENTORY). Drives the
	// HUD panel and the 1-9 hotkeys.
	// Inventory + placement + offline-loot state (items, panel-open, pickup
	// cooldowns, deployable ghost). Drives the HUD panel and the 1-9 hotkeys.
	private inv: InventoryState = makeInventoryState();
	// Spell loadout (first 9 spelldb spells) + casting state.
	private spells: SpellState = makeSpellState();
	// Unsubscribe handle for HUD inventory intents (use/drop/reorder).
	private offIntent?: () => void;
	private offCorpseIntent?: () => void;
	private offSpaceExit?: () => void;
	// Reusable scratch array for snapshot z-filter (reduces GC churn).
	private floorFilterScratch: EntityDelta[] = [];

	private syncBridge!: SyncBridge<EntityRefs>;
	private syncResolvers!: SyncResolvers;
	private hoverTile!: Phaser.GameObjects.Graphics;

	constructor() {
		super({ key: 'IsoArpgScene' });
	}

	preload() {
		// Boot-only: the lazy texture residency also drives this loader mid-game, and
		// its progress must NOT re-raise the boot overlay over the running game.
		this.load.on('progress', (p: number) => {
			if (this.bootReady) return;
			const done = this.load.totalComplete;
			const total = done + this.load.totalToLoad;
			emitBoot({
				phase: 'assets',
				message: 'Loading assets',
				progress: p,
				detail: total > 0 ? `${done}/${total} files` : undefined,
			});
		});
		this.load.on('fileprogress', (file: Phaser.Loader.File) => {
			if (this.bootReady) return;
			emitBoot({
				phase: 'assets',
				message: 'Loading assets',
				progress: this.load.progress,
				detail: file?.key ? `Fetching ${file.key}` : undefined,
			});
		});
		this.load.image(GROUND_TEXTURE_KEY, arpgAsset(GROUND_TEXTURE_PATH));
		for (const b of BIOMES) {
			this.load.image(biomeTextureKey(b), arpgAsset(biomeTexturePath(b)));
		}
		this.load.once(Phaser.Loader.Events.COMPLETE, () =>
			this.applyBiomeFiltering(),
		);
		preloadClass(this, RANGER_CLASS);
		for (const def of ENV_REGISTRY.values()) preloadEnv(this, def);
		preloadShip(this);
		preloadTrees(this);
		preloadStairs(this);
		preloadItemAtlas(this);
		preloadCursors(this);
	}

	private applyBiomeFiltering(): void {
		const renderer = this.renderer;
		if (renderer.type !== Phaser.WEBGL) return;
		const gl = (renderer as Phaser.Renderer.WebGL.WebGLRenderer).gl;
		const aniso =
			gl.getExtension('EXT_texture_filter_anisotropic') ??
			gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
		const anisoMax = aniso
			? (gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number)
			: 0;
		for (const b of BIOMES) {
			const raw = (
				this.textures.get(biomeTextureKey(b)).source[0]
					.glTexture as unknown as {
					webGLTexture: WebGLTexture | null;
				}
			)?.webGLTexture;
			if (!raw) continue;
			gl.bindTexture(gl.TEXTURE_2D, raw);
			gl.generateMipmap(gl.TEXTURE_2D);
			gl.texParameteri(
				gl.TEXTURE_2D,
				gl.TEXTURE_MIN_FILTER,
				gl.LINEAR_MIPMAP_LINEAR,
			);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			if (aniso) {
				gl.texParameterf(
					gl.TEXTURE_2D,
					aniso.TEXTURE_MAX_ANISOTROPY_EXT,
					anisoMax,
				);
			}
		}
		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	create() {
		this.cameras.main.setBackgroundColor(COLORS.background);
		this.kinds = makeKindResolvers(this.kindRegistry);
		registerClassAnims(this, RANGER_CLASS);
		for (const def of ENV_REGISTRY.values()) registerEnvAnims(this, def);
		registerShipAnims(this);

		this.drawGrid();
		buildFog(this, this.fog);
		if (USE_GROUND_SHADER) {
			this.ground = makeGroundShader(this);
			this.ground.update(this.cameras.main);
			this.ground.shader.setVisible(this.isSurface());
		}
		this.setupInput();
		this.buildBridge();
		this.setupZoom();

		this.prewarmTreePool();
		this.connectClient();

		this.time.addEvent({
			delay: HEARTBEAT_MS,
			loop: true,
			callback: () => this.client?.heartbeat(),
		});

		this.offIntent = onInventoryIntent((intent) =>
			this.handleInventoryIntent(intent),
		);

		// Loot panel intents from React -> the authoritative client.
		this.offCorpseIntent = onCorpseIntent((intent) => {
			if (intent.type === 'take')
				this.client?.takeFromCorpse(intent.corpse, intent.slot);
			else if (intent.type === 'all')
				this.client?.action(ACTION_LOOT, intent.corpse);
		});

		// Returning from the 3D space scene: ask the server to re-materialise the ship
		// + pilot at the launch tile (entering cutscene -> fly). Fires even while the
		// Phaser scene is paused — it's a plain event bus + WebSocket send.
		this.offSpaceExit = onSpaceExit(() => this.client?.returnSpace());

		this.initSpellLoadout();

		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
	}

	private drawGrid() {
		// Static base ground: one non-repeating texture laid on the iso plane.
		// It is just the backdrop — the dungeon's room/corridor look is a
		// separate tile eco-system drawn ON TOP later. The DungeonField still
		// drives walkability + streaming; it does NOT carve this base.
		this.dungeonView = makeDungeonView(this);
		this.refreshDungeon({ x: 0, y: 0 }, true);
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
			(added, removed) => {
				for (const c of removed) this.unpredictChunkTrees(c.cx, c.cy);
				for (const c of added) this.predictChunkTrees(c.cx, c.cy);
			},
		);
	}

	private rebuildDungeon() {
		rebuildDungeonView(
			this,
			this.dungeonView,
			this.dungeon,
			this.isSurface(),
			this.move.predicted,
			(added, removed) => {
				for (const c of removed) this.unpredictChunkTrees(c.cx, c.cy);
				for (const c of added) this.predictChunkTrees(c.cx, c.cy);
			},
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
		// Stand up the central input: router + context stack + keyboard device.
		this.inputRouter.setContext(this.inputCtx);
		this.kbDevice = new KeyboardDevice(
			this.input.keyboard!,
			this.inputRouter,
		);
		this.kbDevice.attach();
		// While the chat input is focused, push the Chat context so MOVE/combat
		// actions gate (typing can't move or fire); pop it on blur.
		onChatFocus((focused) => {
			if (focused) this.inputCtx.push(InputContextId.Chat);
			else this.inputCtx.pop(InputContextId.Chat);
		});
		const refs = setupInputV(this, this.inputDeps());
		this.cursors = refs.cursors;
		this.fireKey = refs.fireKey;
		this.setupShipInput();
	}

	// The ship interaction key. Raw handler (like zoom) so it bypasses the input
	// router. The ship is fully server-authoritative now — F just sends the board/leave
	// intent; the snapshot's `piloting` + ship phase drive all visuals.
	//   F = board the prompted ship, or leave if piloting.
	private setupShipInput(): void {
		const kb = this.input.keyboard;
		if (!kb) return;
		kb.on('keydown-F', () => {
			if (this.localPiloting) this.exitShip();
			else {
				const eid = this.shipPrompt?.visible
					? (this.shipPrompt.getData('eid') as number)
					: null;
				if (eid != null) this.enterShip(eid);
			}
		});
		// G launches the flying ship off-planet into the solo 3D space instance. The
		// server validates the ship is actually flying (phase Fly); the leaving
		// cutscene + off-grid handoff follow from the snapshot stream.
		kb.on('keydown-G', () => {
			if (this.localPiloting) this.client?.launchSpace();
		});
	}

	/** Per-frame: show the "Enter Ship" prompt when on foot near a parked ship. */
	private updateShipPrompt(): void {
		if (this.localPiloting) {
			this.shipPrompt?.setVisible(false);
			return;
		}
		const me = this.move.predicted;
		let nearEid: number | null = null;
		for (const [eid, t] of this.shipTile) {
			const ctl = this.shipCtl.get(eid);
			if (!ctl || ctl.currentState !== 'off') continue;
			const d = Math.max(Math.abs(t.x - me.x), Math.abs(t.y - me.y));
			if (d <= IsoArpgScene.SHIP_ENTER_RANGE) {
				nearEid = eid;
				break;
			}
		}
		if (nearEid === null) {
			this.shipPrompt?.setVisible(false);
			return;
		}
		const ctl = this.shipCtl.get(nearEid)!;
		const prompt = this.ensureShipPrompt();
		prompt.setData('eid', nearEid);
		prompt.setPosition(
			ctl.sprite.x,
			ctl.sprite.y - ctl.sprite.displayHeight * 0.5 - 16,
		);
		prompt.setDepth(ctl.sprite.depth + 1000);
		prompt.setVisible(true);
	}

	private ensureShipPrompt(): Phaser.GameObjects.Container {
		if (this.shipPrompt) return this.shipPrompt;
		const label = this.add.text(0, 0, '▶ Enter Ship  [F]', {
			fontFamily: 'monospace',
			fontSize: '14px',
			color: '#cde4ff',
			backgroundColor: '#10141cdd',
			padding: { x: 10, y: 6 },
		});
		label.setOrigin(0.5, 0.5);
		const c = this.add.container(0, 0, [label]);
		c.setSize(label.width, label.height);
		c.setInteractive(
			new Phaser.Geom.Rectangle(
				-label.width / 2,
				-label.height / 2,
				label.width,
				label.height,
			),
			Phaser.Geom.Rectangle.Contains,
		);
		c.on('pointerdown', () => {
			const eid = c.getData('eid') as number | undefined;
			if (eid != null) this.enterShip(eid);
		});
		c.setScrollFactor(1);
		this.shipPrompt = c;
		return c;
	}

	/** Send the board intent. The server validates range/parked/unoccupied; on success
	 * the next snapshot carries our `piloting` + the ship's lift phase, and the visuals
	 * follow from there (no optimistic local state — keeps every client consistent). */
	private enterShip(eid: number): void {
		this.client?.enterShip(eid);
		this.shipPrompt?.setVisible(false);
	}

	private exitShip(): void {
		this.client?.exitShip();
	}

	/** Show/hide a player's body display objects (sprite, baked shadow, hp bar, status
	 * fx) — but NOT the nameplate, which floats over the ship while piloting. */
	private setPlayerBodyVisible(eid: number, visible: boolean): void {
		const r = this.store.refs(eid);
		if (!r) return;
		r.sprite.setVisible(visible);
		r.shadow?.setVisible(visible);
		r.hpBar?.setVisible(visible);
		r.statusFx?.setVisible(visible);
	}

	/** Per-snapshot: track which players are piloting from `delta.piloting` (the wire
	 * flag). Body-hide + nameplate-follow are applied per FRAME in updatePilots (ships
	 * interpolate between snapshots). Restores a body the tick it stops piloting. */
	private reconcilePilots(entities: readonly EntityDelta[]): void {
		for (const e of entities) {
			if (!isPlayerKind(this.kinds, e.kind)) continue;
			const ship = e.piloting ?? 0;
			if (ship !== 0) {
				this.pilots.set(e.eid, ship);
			} else if (this.pilots.delete(e.eid)) {
				this.setPlayerBodyVisible(e.eid, true); // just disembarked
			}
		}
		this.localPiloting = this.pilots.has(this.myEid);
	}

	/** The local player drives the ship, so the camera follows the SHIP while piloting
	 * (the on-foot body is hidden + bound to the hull) and snaps back on exit. Only
	 * re-targets on a change so it doesn't restart the smooth-follow every frame. */
	private updateCameraFollow(): void {
		// If our follow target was destroyed (ship/body went off-grid into space),
		// stop following it NOW — a camera tracking a dead sprite crashes on update.
		if (this.camFollowTarget && !this.camFollowTarget.active) {
			this.cameras.main.stopFollow();
			this.camFollowTarget = undefined;
		}
		const ship = this.pilots.get(this.myEid);
		const shipSprite =
			ship !== undefined ? this.shipCtl.get(ship)?.sprite : undefined;
		// Follow the ship while piloting (and its sprite is live), else the body.
		const useShip = !!shipSprite && shipSprite.active;
		const target = useShip
			? shipSprite
			: this.store.refs(this.myEid)?.sprite;
		// Nothing live to follow (both off-grid in space) — leave the camera put.
		if (!target || !target.active || target === this.camFollowTarget)
			return;
		this.cameras.main.startFollow(target, true, 0.12, 0.12);
		this.camFollowTarget = target;
		this.camFollowing = useShip ? 'ship' : 'player';
	}

	/** Per frame: hide every piloting player's body and float its nameplate over the
	 * ship it flies, so ALL clients see who is aboard as the ship moves/interpolates. */
	private updatePilots(): void {
		for (const [peid, ship] of this.pilots) {
			this.setPlayerBodyVisible(peid, false);
			const sctl = this.shipCtl.get(ship);
			const refs = this.store.refs(peid);
			if (sctl && refs?.nameplate) {
				refs.nameplate.setPosition(
					sctl.sprite.x,
					sctl.sprite.y - sctl.sprite.displayHeight * 0.5 - 8,
				);
				refs.nameplate.setDepth(sctl.sprite.depth + 1);
			}
		}
	}

	// Airborne ships float above their tile + sort over the trees. Lift in px; depth
	// just under the UI layer so the hull clears env/players but stays below HUD.
	private static readonly FLY_LIFT_PX = 36;
	// Remote-ship position smoothing per frame (exponential lerp toward the streamed
	// sub-tile pos). The local pilot's ship skips this — it rides the predicted body.
	private static readonly SHIP_LERP = 0.3;

	/**
	 * Smooth-flight pass: each frame, place every airborne ship, raise it over the trees
	 * (origin lift) and over-sort it. The env tile-snap is choppy, so we drive position
	 * here — the LOCAL pilot's ship rides the client-predicted float body (zero latency),
	 * remote ships lerp toward their streamed sub-tile pos so they glide, not teleport.
	 */
	private tickShipFlyVisual(dtMs: number): void {
		const myShip = this.pilots.get(this.myEid);
		for (const eid of this.flyingShips) {
			const ctl = this.shipCtl.get(eid);
			if (!ctl) continue;
			if (eid === myShip) {
				// Drive the LOCAL ship's heading off the PREDICTED velocity (immediate, no
				// server round-trip) so the nose tracks the movement — no crab — then ease.
				const v = this.move.floatState.vel;
				if (Math.hypot(v.x, v.y) > 0.25) {
					ctl.setFacing(shipFacing16(v.x, v.y));
				}
			}
			ctl.tickTurn(dtMs); // ease heading toward the target (spaceship turn)
			if (eid === myShip) {
				const p = worldToScreen(
					this.move.floatState.pos.x,
					this.move.floatState.pos.y,
				);
				ctl.sprite.setPosition(p.x, p.y);
			} else {
				const t = this.shipPos.get(eid);
				if (t) {
					const p = worldToScreen(t.x, t.y);
					ctl.sprite.setPosition(
						Phaser.Math.Linear(
							ctl.sprite.x,
							p.x,
							IsoArpgScene.SHIP_LERP,
						),
						Phaser.Math.Linear(
							ctl.sprite.y,
							p.y,
							IsoArpgScene.SHIP_LERP,
						),
					);
				}
			}
			ctl.flyVisual(IsoArpgScene.FLY_LIFT_PX, DEPTH_UI - 5);
		}
	}

	/**
	 * Pilot-steering debug overlay: a screen-cardinal compass (N/E/S/W, ground truth)
	 * with a live YELLOW arrow showing the ship's ACTUAL screen-movement direction and a
	 * readout of the facing index + heading. Press a key, read where the arrow points vs
	 * the compass, and that's exactly what PILOT_STEER_ROT / the facing map must match.
	 */
	private drawPilotDebug(): void {
		if (!this.pilotDbgG) {
			this.pilotDbgG = this.add.graphics().setDepth(100000);
			for (let i = 0; i < 5; i++) {
				this.pilotDbgText.push(
					this.add
						.text(0, 0, '', {
							fontFamily: 'ui-monospace, monospace',
							fontSize: '14px',
							color: '#ffffff',
							stroke: '#000000',
							strokeThickness: 3,
						})
						.setDepth(100001)
						.setOrigin(0.5),
				);
			}
		}
		const g = this.pilotDbgG;
		const texts = this.pilotDbgText;
		const hide = () => {
			g.clear();
			for (const t of texts) t.setVisible(false);
		};
		if (!this.localPiloting) return hide();
		const shipEid = this.pilots.get(this.myEid);
		const ctl =
			shipEid !== undefined ? this.shipCtl.get(shipEid) : undefined;
		if (!ctl) return hide();

		const ox = ctl.sprite.x;
		const oy = ctl.sprite.y;
		const R = 90;
		g.clear();
		// Compass cross — screen cardinals, the truth we calibrate against.
		g.lineStyle(2, 0x66ccff, 0.5);
		g.beginPath();
		g.moveTo(ox, oy - R);
		g.lineTo(ox, oy + R);
		g.moveTo(ox - R, oy);
		g.lineTo(ox + R, oy);
		g.strokePath();
		const place = (
			i: number,
			dx: number,
			dy: number,
			s: string,
			c: string,
		) =>
			texts[i]
				.setVisible(true)
				.setColor(c)
				.setText(s)
				.setPosition(ox + dx, oy + dy);
		place(0, 0, -R - 12, 'N', '#66ccff');
		place(1, R + 12, 0, 'E', '#66ccff');
		place(2, 0, R + 12, 'S', '#66ccff');
		place(3, -R - 12, 0, 'W', '#66ccff');

		// Yellow arrow = actual screen movement (world velocity → screen).
		const v = this.move.floatState.vel;
		const sx = (v.x - v.y) * 32;
		const sy = (v.x + v.y) * 16;
		const mag = Math.hypot(sx, sy);
		let info = `facing ${ctl.facingIndex}`;
		if (mag > 0.001) {
			const ux = sx / mag;
			const uy = sy / mag;
			const ex = ox + ux * R;
			const ey = oy + uy * R;
			g.lineStyle(4, 0xffdd33, 1);
			g.beginPath();
			g.moveTo(ox, oy);
			g.lineTo(ex, ey);
			// arrowhead
			const ah = 12;
			const base = Math.atan2(uy, ux);
			g.moveTo(ex, ey);
			g.lineTo(
				ex - ah * Math.cos(base - 0.4),
				ey - ah * Math.sin(base - 0.4),
			);
			g.moveTo(ex, ey);
			g.lineTo(
				ex - ah * Math.cos(base + 0.4),
				ey - ah * Math.sin(base + 0.4),
			);
			g.strokePath();
			const names = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
			const a = ((base * 180) / Math.PI + 360) % 360;
			info += `  move ${names[Math.round(a / 45) % 8]} (${a.toFixed(0)}°)`;
		} else {
			info += '  move —';
		}
		place(4, 0, -R - 30, info, '#ffdd33');
	}

	private setupZoom() {
		this.zoomTarget = this.cameras.main.zoom;
		// Bound the target to a small lead past the CURRENT zoom so Safari/macOS
		// trackpad momentum (one swipe = a burst of decaying wheel events) can't fling
		// the target across the whole range; it tracks ~LEAD ahead while you scroll.
		const bump = (d: number) => {
			const z = this.cameras.main.zoom;
			this.zoomTarget = Phaser.Math.Clamp(
				Phaser.Math.Clamp(
					this.zoomTarget + d,
					z - IsoArpgScene.ZOOM_MAX_LEAD,
					z + IsoArpgScene.ZOOM_MAX_LEAD,
				),
				IsoArpgScene.ZOOM_MIN,
				IsoArpgScene.ZOOM_MAX,
			);
		};
		this.input.keyboard?.on('keydown-PLUS', () =>
			bump(IsoArpgScene.ZOOM_STEP),
		);
		this.input.keyboard?.on('keydown-MINUS', () =>
			bump(-IsoArpgScene.ZOOM_STEP),
		);
		this.input.on(
			'wheel',
			(_p: unknown, _o: unknown, _dx: number, dy: number) =>
				bump(dy > 0 ? -IsoArpgScene.ZOOM_STEP : IsoArpgScene.ZOOM_STEP),
		);
	}

	private tickZoom(deltaMs: number) {
		const cam = this.cameras.main;
		const target = this.zoomTarget;
		if (
			Math.abs(target - cam.zoom) < 0.0005 &&
			Math.abs(this.zoomVel) < 1e-4
		) {
			if (cam.zoom !== target) cam.setZoom(target);
			this.zoomVel = 0;
			return;
		}
		const dt = Math.min(deltaMs, 50) / 1000;
		const omega = 2 / IsoArpgScene.ZOOM_SMOOTH_TIME;
		const x = omega * dt;
		const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
		const maxChange =
			IsoArpgScene.ZOOM_MAX_SPEED * IsoArpgScene.ZOOM_SMOOTH_TIME;
		let change = cam.zoom - target;
		change = Phaser.Math.Clamp(change, -maxChange, maxChange);
		const temp = (this.zoomVel + omega * change) * dt;
		this.zoomVel = (this.zoomVel - omega * temp) * exp;
		let next = target + (change + temp) * exp;
		if (cam.zoom - target > 0 === next > target) {
			next = target;
			this.zoomVel = 0;
		}
		cam.setZoom(next);
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
			isCorpse: (e) => this.kinds.ref(this.store.kind(e)) === CORPSE_REF,
			useInventorySlot: (i) => this.useInventorySlot(i),
			castSpellSlot: (i) => this.castSpellSlot(i),
			exitPlacement: () => this.exitPlacement(),
			rotatePlacement: () => rotatePlacementV(this.inv, this.invDeps()),
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
				const player = isPlayerKind(this.kinds, e.kind);
				const cref = this.kinds.ref(e.kind);
				// Wake a parked creature of this def if one is pooled; only build a
				// fresh sprite on a cold pool. Player + non-creature kinds skip both.
				const pooled = player
					? null
					: this.creaturePool.acquire(cref ?? '');
				const creatureSprite =
					player || pooled ? null : makeCreatureSprite(this, cref);
				if (player) {
					refs = this.makePlayerRefs(e.kind);
					// Remote players render-interpolate off the same sub-tile interp
					// buffer NPCs use, fed the server's qx/qy each snapshot, so they
					// glide instead of snapshot-tweening between tile centers. The
					// local player ignores it (float-driven; its buffer is never fed
					// and tickPlayerInterp skips myEid).
					refs.interp = newInterp(this.time.now, e.tile.x, e.tile.y);
				} else if (pooled) {
					refs = this.wakeCreature(pooled, e);
				} else if (creatureSprite) {
					refs = {
						sprite: creatureSprite.sprite,
						creature: creatureSprite.creature,
						shadow: creatureSprite.shadow,
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
					if (this.kinds.ref(e.kind) === TREE_REF) {
						const { variant, felled } = decodeTreeSub(e.sub);
						this.treeState.set(e.eid, { variant, felled });
						const key = packTile(e.tile.x, e.tile.y);
						this.serverTreeTiles.add(key);
						const predicted = this.predictedTrees.get(key);
						let sprite: Phaser.GameObjects.Sprite;
						if (predicted) {
							this.predictedTrees.delete(key);
							sprite = felled
								? reskinTreeSprite(predicted, variant, true)
								: predicted;
						} else {
							sprite = this.acquireTree(variant, felled);
						}
						refs = { sprite };
					} else if (this.kinds.ref(e.kind) === CORPSE_REF) {
						refs = { sprite: makeCorpseSprite(this) };
					} else if (this.kinds.ref(e.kind) === SHIP_REF) {
						// Ship uses the stateful pilot rig, not the static env sprite.
						// `sub` packs facing (low nibble) + drive phase (high nibble);
						// per-snapshot phase/facing is driven by reconcileShips().
						const facing = shipFacingFromSub(e.sub);
						this.shipFacing.set(e.eid, facing);
						this.shipTile.set(e.eid, { x: e.tile.x, y: e.tile.y });
						let ctl = this.shipCtl.get(e.eid);
						if (!ctl) {
							ctl = new ShipController(this, 0, 0);
							ctl.autoAdvance = false; // server owns the phase
							this.shipCtl.set(e.eid, ctl);
							ctl.sprite.once(
								Phaser.GameObjects.Events.DESTROY,
								() => {
									this.shipCtl.delete(e.eid);
									this.shipPos.delete(e.eid);
									this.flyingShips.delete(e.eid);
								},
							);
						}
						ctl.setFacing(facing);
						refs = { sprite: ctl.sprite };
					} else {
						const envRef = this.kinds.ref(e.kind);
						const envSprite = makeEnvSprite(this, envRef, e.sub);
						refs = {
							sprite:
								envSprite ??
								makeSprite(this, this.kinds, e.kind, false),
						};
					}
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
				if (refs.creature) {
					const view = refs.creature;
					const sprite = refs.sprite as Phaser.GameObjects.Sprite;
					const shadow = refs.shadow;
					const ready = this.residency.acquire(
						this.creatureResource(view.def),
						() => {
							// The sprite may have been culled/destroyed while its sheets
							// loaded; only reveal + re-pose if it's still in the scene.
							if (!sprite.scene) return;
							resetCreaturePose(sprite, view);
							if (shadow) resetCreatureShadow(shadow, view);
							// Don't un-hide a piloting player's body — this async load
							// callback fires after updatePilots() hid it, which would
							// flash the body on the ground as the ship moves.
							if (this.pilots.has(e.eid)) return;
							sprite.setVisible(true);
							shadow?.setVisible(true);
						},
					);
					// Hide until the sheets are resident so Phaser's __MISSING box
					// (the lazy-load placeholder) never flashes on first spawn.
					if (!ready) {
						sprite.setVisible(false);
						shadow?.setVisible(false);
					}
				}
				this.placeSprite(refs.sprite, e.tile.x, e.tile.y);
				if (this.kinds.cat(e.kind) === Cat.Env) {
					attachEnvLight(this, refs.sprite, this.kinds.ref(e.kind));
				}
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
					// A jump too large for one snapshot at NPC speed is a discontinuity
					// (AOI re-entry, respawn, server snap), not motion — snap the buffer
					// instead of letting the spline sweep the sprite across the screen.
					const last = refs.interp.buf[refs.interp.buf.length - 1];
					if (
						last &&
						Math.hypot(tile.x - last.x, tile.y - last.y) >
							IsoArpgScene.INTERP_SNAP_DIST
					) {
						resetInterp(refs.interp, this.time.now, tile.x, tile.y);
					} else {
						pushSample(refs.interp, this.time.now, tile.x, tile.y);
					}
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
				// Pool culled creatures (streaming predators churn constantly) so the
				// next spawn of the same def reuses the Sprite instead of rebuilding.
				if (
					refs.creature &&
					refs.sprite instanceof Phaser.GameObjects.Sprite
				) {
					const defId = refs.creature.def.id;
					this.parkCreature(refs);
					this.creaturePool.release(defId, refs);
					this.residency.release(`creature:${defId}`);
					return;
				}
				if (
					this.treeState.has(eid) &&
					refs.sprite instanceof Phaser.GameObjects.Sprite
				) {
					const t = this.store.tile(eid);
					if (t) this.serverTreeTiles.delete(packTile(t.x, t.y));
					this.poolTree(refs.sprite);
					this.treeState.delete(eid);
					return;
				}
				if (
					this.kinds.cat(this.store.kind(eid)) === Cat.Item &&
					this.animateItemPickup(refs)
				) {
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
				if (this.kinds.ref(e.kind) === CORPSE_REF) {
					const name =
						this.slotUsername.get(e.owner) ?? 'a fallen hero';
					return `Graveyard of ${name}`;
				}
				return undefined;
			},
		};
	}

	private connectClient() {
		const cfg = getNetConfig();
		if (!cfg) return;
		emitBoot({ phase: 'connecting', message: 'Connecting to the realm' });
		const client = new GameClient({
			url: cfg.wsUrl,
			jwt: cfg.jwt,
			kbveUsername: cfg.username,
		});
		this.client = client;

		client.on('welcome', (w: Welcome) => {
			// Belt-and-suspenders: the server rejects a mismatched JoinMatch, but if
			// a stale client bundle somehow gets a Welcome from a newer server, the
			// wire shapes won't match — refresh to the current bundle.
			if (w.protocol !== PROTOCOL_VERSION) {
				this.recoverStaleClient('version');
				return;
			}
			// Connected clean — clear the one-shot version-reload guard so a future
			// real mismatch can reload again.
			try {
				sessionStorage.removeItem('arpg-version-reload');
			} catch {
				/* private mode */
			}
			this.mySlot = w.your_slot;
			this.kindRegistry.clear();
			for (const entry of w.registry ?? []) {
				this.kindRegistry.set(entry.kind, entry);
			}
			emitBoot({ phase: 'entering', message: 'Entering the dungeon' });
		});
		client.on('snapshot', (s: Snapshot) => this.applySnapshot(s));
		client.on('combat', (c: CombatEvent) => this.onCombat(c));
		client.on('projectile', (p: ProjectileEvent) => this.onProjectile(p));
		client.on('floor', (f: FloorChangeEvent) => this.onFloorChange(f));
		client.on('inventory', (inv: InventorySync) => {
			setInventory(this.inv, inv.items);
		});
		// Corpse loot panel: forward the server's contents to the React LootPanel.
		client.on('corpse', (c: CorpseContents) => emitCorpseOpen(c));
		// Placement rejected server-side (out of range, occupied): the item was
		// kept, so the inventory is unchanged — just clear the armed ghost.
		client.on('itemPlaced', (e: ItemPlacedEvent) => {
			if (!e.ok) exitPlacementV(this.inv);
		});

		// Connection health: before the player spawns, drive the boot overlay;
		// after, drive the in-game reconnect banner.
		const max = IsoArpgScene.MAX_RECONNECTS;
		client.on('state', (s) => {
			if (this.bootReady) {
				if (s.status === 'connected') {
					emitConnection({
						status: 'connected',
						attempts: 0,
						maxAttempts: max,
					});
				} else if (s.status === 'reconnecting') {
					emitConnection({
						status: 'reconnecting',
						attempts: s.attempts,
						maxAttempts: max,
					});
				} else if (s.status === 'closed') {
					emitConnection({
						status: 'closed',
						attempts: s.attempts,
						maxAttempts: max,
					});
				}
			} else if (s.status === 'reconnecting') {
				emitBoot({
					phase: 'connecting',
					message: `Reconnecting (${s.attempts}/${max})`,
				});
			} else if (s.status === 'closed') {
				emitBoot({
					phase: 'error',
					message: 'Could not reach the server',
				});
			}
		});
		// Server refused us for good (bad/expired token, version mismatch, full).
		client.on('reject', (reason: string) => {
			const r = (reason || '').toLowerCase();
			// Stale/expired Supabase session — the stored JWT points at a session
			// that no longer exists, so a plain reload just re-sends the dead token.
			// Drop the session and reload to the sign-in flow (auto-recovers what
			// used to need a manual localStorage.clear()).
			if (/auth rejected|session|expired|invalid|jwt|token/.test(r)) {
				this.recoverStaleClient('session');
				return;
			}
			// Out-of-date client bundle — clear local state + reload (one-shot).
			if (/protocol mismatch|out of date|version/.test(r)) {
				this.recoverStaleClient('version');
				return;
			}
			if (this.bootReady) {
				emitConnection({
					status: 'closed',
					attempts: max,
					maxAttempts: max,
				});
			} else {
				emitBoot({
					phase: 'error',
					message: reason || 'Connection rejected',
				});
			}
		});

		client.connect();
	}

	/**
	 * Auto-recover a wedged client instead of stranding the player on a dead
	 * error. `session`: the stored Supabase token references an expired/missing
	 * session — drop the sb-* keys so the reload lands on sign-in (no token = no
	 * auto-connect, so it can't loop). `version`: the client bundle is out of date
	 * — clear non-session state and reload to fetch the new bundle, but ONCE: if
	 * the server is the older side a reload can't fix it, so a one-shot guard
	 * surfaces a terminal message instead of reload-looping.
	 */
	private recoverStaleClient(kind: 'session' | 'version'): void {
		try {
			if (kind === 'version') {
				if (sessionStorage.getItem('arpg-version-reload')) {
					emitBoot({
						phase: 'error',
						message: 'Game out of date — update required',
					});
					return;
				}
				sessionStorage.setItem('arpg-version-reload', '1');
				for (const k of Object.keys(localStorage)) {
					if (!k.startsWith('sb-')) localStorage.removeItem(k);
				}
			} else {
				for (const k of Object.keys(localStorage)) {
					if (k.startsWith('sb-')) localStorage.removeItem(k);
				}
			}
		} catch {
			/* storage blocked (private mode) — fall through to reload */
		}
		this.client?.close();
		location.reload();
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
			floatTilePos: () => floatTile(this.move.floatState),
			dungeon: () => this.dungeon,
			isBlocked: (x, y) => this.isBlocked(x, y),
			onPlacementArmed: () => this.hoverTile.setVisible(false),
		};
	}

	private initSpellLoadout(): void {
		initSpellLoadoutV(this.spells);
	}

	private castSpellSlot(idx: number): void {
		castSpellSlotV(this.spells, this.spellDeps(), idx);
	}

	private spellDeps(): SpellDeps {
		return {
			scene: this,
			client: () => this.client,
			store: this.store,
			floatState: this.move.floatState,
			predicted: () => this.move.predicted,
			isHostile: (e) => this.isHostileServer(e),
		};
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
		emitPlayers(s.players.length);
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
		// Reuse scratch array to reduce GC churn (10-20 snapshots/sec).
		this.floorFilterScratch.length = 0;
		for (const e of s.entities) {
			if ((e.z ?? 0) === this.currentFloor) {
				this.floorFilterScratch.push(e);
			}
		}
		applyEntitySync(
			this.floorFilterScratch,
			this.store,
			this.syncBridge,
			this.syncResolvers,
			state,
			this.markEnvDirty,
		);
		this.reconcileTrees(this.floorFilterScratch);
		this.reconcileShips(this.floorFilterScratch);
		this.reconcilePilots(this.floorFilterScratch);
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
			// Local player is in-world — tear down the boot/loading overlay and
			// route any further connection drops to the in-game banner.
			this.bootReady = true;
			emitBoot({ phase: 'ready', message: '' });
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
			dungeon: () => this.dungeon,
			gateGraph: this.gateGraph,
			isBlocked: (x, y) => this.isBlocked(x, y),
			moveAxisX: () =>
				this.inputRouter.axis(Action.MoveLeft, Action.MoveRight),
			moveAxisY: () =>
				this.inputRouter.axis(Action.MoveUp, Action.MoveDown),
			walking: () => this.cursors.shift?.isDown ?? false,
			pilotSteer: () => this.localPiloting,
			combat: this.combat,
			refreshDungeon: (tile) => this.refreshDungeon(tile),
		};
	}

	private onCombat(c: CombatEvent) {
		onCombatV(this.combat, this.combatDeps(), c);
		// Local player died — surface the death overlay (server respawns instantly,
		// so this is the reliable trigger, not a sustained hp=0).
		if (c.died && c.target === this.myEid) emitDeath();
	}

	/**
	 * A server-broadcast projectile loosed by SOME shooter. The local player's own
	 * arrow is already client-predicted in fireBowAt, so skip it here (else a
	 * doubled shaft); for every remote shooter, fly the cosmetic arrow and snap
	 * their bow pose, recovering it to Idle since remote one-shots have no
	 * snapshot-driven settle of their own.
	 */
	private onProjectile(p: ProjectileEvent) {
		if (p.attacker === this.myEid) return;
		flyRemoteArrow(this, p.from, p.to);
		const refs = this.store.refs(p.attacker);
		if (!refs?.cls || !(refs.sprite instanceof Phaser.GameObjects.Sprite))
			return;
		const sprite = refs.sprite;
		const cls = refs.cls;
		setClassPose(sprite, cls, 'Attack', {
			dx: p.to.x - p.from.x,
			dy: p.to.y - p.from.y,
		});
		const atk = cls.def.anims.Attack;
		const recoverMs = (atk.frames / atk.frameRate) * 1000 + 80;
		this.time.delayedCall(recoverMs, () => {
			if (!sprite.active || cls.state !== 'Attack') return;
			if (this.tweens.isTweening(sprite)) return;
			setClassPose(sprite, cls, 'Idle', undefined, this);
		});
	}

	private combatDeps(): CombatDeps {
		return {
			scene: this,
			store: this.store,
			client: () => this.client,
			myEid: () => this.myEid,
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

	// A removed ground item this close (screen px) to the local player reads as a
	// pickup, not an AOI cull — only then do we fly it into the pack.
	private static readonly PICKUP_ANIM_MAX_DIST = 140;

	/**
	 * Cosmetic pickup: float the ground-item sprite into the local player while it
	 * shrinks + fades, then destroy it. Returns false (caller destroys immediately)
	 * when there's no local player or the item is too far to be a real pickup.
	 */
	private animateItemPickup(refs: EntityRefs): boolean {
		const sprite = refs.sprite;
		if (!(sprite instanceof Phaser.GameObjects.Sprite)) return false;
		const target =
			this.myEid >= 0 ? this.store.refs(this.myEid)?.sprite : undefined;
		if (!target) return false;
		const dist = Math.hypot(sprite.x - target.x, sprite.y - target.y);
		if (dist > IsoArpgScene.PICKUP_ANIM_MAX_DIST) return false;
		this.tweens.killTweensOf(sprite);
		sprite.setDepth(DEPTH_UI - 1);
		this.tweens.add({
			targets: sprite,
			x: target.x,
			y: target.y - 14,
			scale: sprite.scale * 0.15,
			alpha: 0,
			duration: 260,
			ease: 'Cubic.easeIn',
			onComplete: () => this.destroyRefs(refs),
		});
		return true;
	}

	/** Cached lazy-residency descriptor for a creature def's packed sheets. */
	private creatureResource(def: CreatureDef): TextureResource {
		const id = `creature:${def.id}`;
		let res = this.creatureResources.get(id);
		if (!res) {
			res = {
				id,
				load: (s) => preloadCreature(s, def),
				register: (s) => registerCreatureAnims(s, def),
				unload: (s) => unloadCreature(s, def),
				isLoaded: (s) => isCreatureLoaded(s, def),
			};
			this.creatureResources.set(id, res);
		}
		return res;
	}

	/**
	 * Park a culled creature for reuse: kill its tween, drop the cheap per-entity
	 * HUD bits (rebuilt on wake), and hide the Sprite + shadow so Phaser's update
	 * loop skips them. The pooled refs keep only sprite/shadow/creature.
	 */
	private parkCreature(refs: EntityRefs) {
		this.tweens.killTweensOf(refs.sprite);
		refs.settleTimer?.remove(false);
		refs.settleTimer = undefined;
		refs.nameplate?.destroy();
		refs.nameplate = undefined;
		refs.hpBar?.destroy();
		refs.hpBar = undefined;
		refs.statusFx?.destroy();
		refs.statusFx = undefined;
		refs.dbgText?.destroy();
		refs.dbgText = undefined;
		refs.dbgArrow?.destroy();
		refs.dbgArrow = undefined;
		refs.interp = undefined;
		refs.lastMoveAt = undefined;
		(refs.sprite as Phaser.GameObjects.Sprite)
			.setActive(false)
			.setVisible(false);
		refs.shadow?.setActive(false).setVisible(false);
	}

	/**
	 * Wake a pooled creature for a new spawn: reactivate the Sprite + shadow, reset
	 * its pose to a fresh Idle/south, and re-seed interpolation. The cheap HUD bits
	 * (nameplate/hpBar/statusFx) are rebuilt by the common create tail.
	 */
	private wakeCreature(refs: EntityRefs, e: EntityDelta): EntityRefs {
		const sprite = refs.sprite as Phaser.GameObjects.Sprite;
		sprite.setActive(true).setVisible(true);
		refs.shadow?.setActive(true).setVisible(true);
		if (refs.creature) resetCreaturePose(sprite, refs.creature);
		refs.interp = newInterp(this.time.now, e.tile.x, e.tile.y);
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
			refs.dbgArrow = this.add.graphics().setDepth(DEPTH_UI + 2);
		}
		return refs;
	}

	/**
	 * The local player took a stair: the server moved us to a new dungeon floor.
	 * Snap the float body to the destination tile, switch the active floor (so
	 * collision + rendering use the new layout), and re-stream the dungeon. The
	 * dungeon field is rebuilt for the new z.
	 */
	private onFloorChange(f: FloorChangeEvent) {
		this.currentFloor = f.z;
		this.ground?.shader.setVisible(this.isSurface());
		if (!this.isSurface()) {
			this.clearPredictedTrees();
			this.serverTreeTiles.clear();
		}
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

	/**
	 * Entering the dungeon is a step into hostile, PvP-enabled territory. When the
	 * player stands on the surface down-stair (z>=SURFACE_MIN_Z, about to descend),
	 * flash a one-shot danger notice so the descent is never a surprise. Deeper
	 * floors are already hostile, so the warning fires only at the surface gate.
	 */
	private checkDownStairWarning() {
		if (!this.isSurface()) {
			this.downStairWarnTile = null;
			return;
		}
		const t = floatTile(this.move.floatState);
		const down = stairTile(
			floorSeed(DUNGEON_SEED, this.currentFloor),
			StairKind.Down,
		);
		const key = `${down.x},${down.y}`;
		if (t.x === down.x && t.y === down.y) {
			if (this.downStairWarnTile !== key) {
				this.downStairWarnTile = key;
				this.flashMessage(
					'Beware — the dungeon below is dangerous and PvP is enabled. Tread carefully.',
				);
			}
		} else if (this.downStairWarnTile === key) {
			this.downStairWarnTile = null; // stepped off — allow it to fire again
		}
	}

	/**
	 * Smooth hull collision for the local player: after the float predictor moves us,
	 * push the body out of every ship's oriented hull box (the real collision shape,
	 * vs the coarse tile footprint). Mirrors the server `resolve_ship_collision`, so
	 * the predicted stop matches the authoritative one — no rubber-band. Velocity into
	 * the hull is cancelled; tangential speed survives so the player slides along it.
	 */
	private resolveShipCollision(): void {
		// The pilot rides inside its hull — don't shove its (hidden) body out of any
		// ship while flying (mirrors the server's `Without<Piloting>` exemption).
		if (this.localPiloting) return;
		const s = this.move.floatState;
		let pushed = false;
		for (const sid of this.store.serverIdsWith(Cat.Env)) {
			if (this.kinds.ref(this.store.kind(sid)) !== SHIP_REF) continue;
			const t = this.store.tile(sid);
			if (!t) continue;
			const facing = this.shipFacing.get(sid) ?? 0;
			const hit = resolveShipHull(
				s.pos.x,
				s.pos.y,
				BODY_RADIUS,
				t.x,
				t.y,
				facing,
			);
			if (!hit) continue;
			pushed = true;
			s.pos.x = hit.x;
			s.pos.y = hit.y;
			const vn = s.vel.x * hit.nx + s.vel.y * hit.ny;
			if (vn < 0) {
				s.vel.x -= vn * hit.nx;
				s.vel.y -= vn * hit.ny;
			}
		}
		this.shipPushing = pushed;
		this.drawShipObbLive();
	}

	// TEMP DEBUG: redraw the ship OBB each frame, GREEN while the push-out is firing
	// (player inside the inflated box) and YELLOW when clear, plus a dot at the float
	// position. Walk each side: green = collision active, yellow = slipping through.
	private drawShipObbLive(): void {
		if (!DEBUG_SHIP_COLLISION) return;
		if (!this.shipObbDbg)
			this.shipObbDbg = this.add.graphics().setDepth(DEPTH_UI - 1);
		const g = this.shipObbDbg;
		g.clear();
		let base: TileXY | null = null;
		let facing = 0;
		for (const sid of this.store.serverIdsWith(Cat.Env)) {
			if (this.kinds.ref(this.store.kind(sid)) !== SHIP_REF) continue;
			base = this.store.tile(sid) ?? null;
			facing = this.shipFacing.get(sid) ?? 0;
			break;
		}
		if (!base) return;
		const verts = shipHull(base.x, base.y, facing);
		if (verts.length < 2) return;
		g.lineStyle(3, this.shipPushing ? 0x22ff44 : 0xffd400, 1);
		g.beginPath();
		const p0 = worldToScreen(verts[0][0], verts[0][1]);
		g.moveTo(p0.x, p0.y);
		for (let i = 1; i < verts.length; i++) {
			const p = worldToScreen(verts[i][0], verts[i][1]);
			g.lineTo(p.x, p.y);
		}
		g.closePath();
		g.strokePath();
		// Player float position dot.
		const p = worldToScreen(
			this.move.floatState.pos.x,
			this.move.floatState.pos.y,
		);
		g.fillStyle(0xff00ff, 1);
		g.fillCircle(p.x, p.y, 4);
	}

	/** One-shot on-screen notice via laser's global `notification` event. */
	private flashMessage(text: string) {
		emitNotification({ title: '', message: text });
	}

	update(_time: number, delta: number) {
		// Edge-read UI actions off the router, then clear the frame's press/release
		// bits. Done up top so it runs even on the early-out below; movement reads
		// the held `down` state (unaffected by endFrame) later in the frame.
		if (this.inputRouter.consume(Action.ToggleChat)) emitChatToggle();
		this.inputRouter.endFrame();

		tickCreatureInterpV(this, this.store);
		tickPlayerInterpV(this, this.store, this.myEid);
		tickFacingV(this, this.store);
		this.tickZoom(delta);
		syncFogToZoom(this, this.fog);
		this.ground?.update(this.cameras.main);
		this.residency.tick((id) => {
			if (!id.startsWith('creature:')) return;
			for (const r of this.creaturePool.drain(id.slice(9)))
				this.destroyRefs(r);
		});
		if (this.envDirty) {
			this.refreshEnvBlocked();
			this.envDirty = false;
		}

		if (!this.client || !this.predictSeeded) return;

		// Space fells an adjacent standing tree if there is one, else fires the bow
		// toward the cursor. Suppressed while the chat input owns the keyboard.
		if (
			!isTextInputFocused() &&
			Phaser.Input.Keyboard.JustDown(this.fireKey)
		) {
			if (!this.tryFellAdjacentTree()) {
				const ptr = this.input.activePointer;
				this.fireBowAt(screenToWorldF(ptr.worldX, ptr.worldY));
			}
		}

		const myRefs = this.store.refs(this.myEid);
		// Local motion runs even while piloting — the pilot's Move input IS the ship's
		// control: it drives the (hidden) body, the server mirrors that body onto the
		// ship, and the camera follows the ship. Gating this off would stop all input
		// from reaching the server, so the ship couldn't move.
		if (myRefs) this.tickLocalMotion(myRefs, delta);
		this.resolveShipCollision();
		this.updateShipPrompt();
		// Position + lift the ship FIRST, then place pilot bodies/nameplates onto it, so
		// the nameplate tracks the moved ship instead of lagging a frame behind it.
		this.tickShipFlyVisual(delta);
		this.updatePilots();
		this.drawPilotDebug();
		this.updateCameraFollow();

		this.checkDeadStair();
		this.checkDownStairWarning();
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

	// Tree felling is server-authoritative; per-tree variant + felled state rides
	// the EntityDelta `sub` byte. Tracked here (not in the ECS store) so the env
	// blocker rebuild can drop felled tiles and a standing->felled flip can play
	// the cosmetic topple. Keyed by server eid.
	private treeState = new Map<number, { variant: number; felled: boolean }>();
	// Idle tree sprites parked on despawn; reused on the next surface tree spawn so
	// the streaming churn doesn't rebuild Sprites. Bounded to avoid unbounded hold.
	private treePool: Phaser.GameObjects.Sprite[] = [];
	private static readonly TREE_POOL_MAX = 64;

	private acquireTree(
		variant: number,
		felled: boolean,
	): Phaser.GameObjects.Sprite {
		const pooled = this.treePool.pop();
		const sprite = pooled
			? reskinTreeSprite(pooled, variant, felled)
			: makeTreeSprite(this, variant, felled);
		sprite.setAlpha(0);
		this.tweens.add({
			targets: sprite,
			alpha: 1,
			duration: 300,
			ease: 'Quad.easeOut',
		});
		return sprite;
	}

	private poolTree(sprite: Phaser.GameObjects.Sprite): void {
		this.tweens.killTweensOf(sprite);
		sprite.setActive(false).setVisible(false);
		if (this.treePool.length < IsoArpgScene.TREE_POOL_MAX) {
			this.treePool.push(sprite);
		} else {
			sprite.destroy();
		}
	}

	private static readonly TREE_POOL_PREWARM = 24;

	// Build a batch of parked tree sprites up front so the first chunk of forest
	// streams from the pool instead of allocating Sprites mid-frame (first-spawn
	// hitch). Tree textures are already resident from preload().
	private prewarmTreePool(): void {
		emitBoot({
			phase: 'assets',
			message: 'Loading assets',
			progress: 1,
			detail: 'Warming sprite pool',
		});
		for (let i = 0; i < IsoArpgScene.TREE_POOL_PREWARM; i++) {
			const sprite = makeTreeSprite(this, 0, false);
			sprite.setActive(false).setVisible(false);
			this.treePool.push(sprite);
		}
	}

	// Client-side deterministic tree prediction: place the `treeAt` forest as chunks
	// stream (instant, no network pop). A server tree entity later ADOPTS its predicted
	// sprite at the same tile (serverTreeTiles), so there's never a duplicate. Felled +
	// authoritative state still ride the server entity.
	private predictedTrees = new Map<number, Phaser.GameObjects.Sprite>();
	private serverTreeTiles = new Set<number>();

	private predictChunkTrees(cx: number, cy: number): void {
		if (!this.isSurface()) return;
		const ds = this.dungeon.stairTile(StairKind.Down);
		const x0 = cx * CHUNK_SIZE;
		const y0 = cy * CHUNK_SIZE;
		for (let ty = y0; ty < y0 + CHUNK_SIZE; ty++) {
			for (let tx = x0; tx < x0 + CHUNK_SIZE; tx++) {
				if ((tx === 12 && ty === 12) || (tx === ds.x && ty === ds.y))
					continue;
				const variant = treeAt(DUNGEON_SEED, tx, ty);
				if (variant === null) continue;
				const key = packTile(tx, ty);
				if (
					this.predictedTrees.has(key) ||
					this.serverTreeTiles.has(key)
				) {
					continue;
				}
				const sprite = this.acquireTree(variant, false);
				this.placeSprite(sprite, tx, ty);
				this.predictedTrees.set(key, sprite);
			}
		}
		this.markEnvDirty();
	}

	private unpredictChunkTrees(cx: number, cy: number): void {
		const x0 = cx * CHUNK_SIZE;
		const y0 = cy * CHUNK_SIZE;
		for (let ty = y0; ty < y0 + CHUNK_SIZE; ty++) {
			for (let tx = x0; tx < x0 + CHUNK_SIZE; tx++) {
				const key = packTile(tx, ty);
				const sprite = this.predictedTrees.get(key);
				if (sprite) {
					this.poolTree(sprite);
					this.predictedTrees.delete(key);
				}
			}
		}
	}

	private clearPredictedTrees(): void {
		for (const sprite of this.predictedTrees.values())
			this.poolTree(sprite);
		this.predictedTrees.clear();
	}

	/**
	 * Per-snapshot ship driver. The store drops `sub`, so phase + facing are read from
	 * the delta stream (like trees). For every ship: update the predicted-collision
	 * facing, drive its ShipController to the server's coarse phase, and feed the
	 * fly-state motion from the streamed velocity (idle vs move). Authoritative — the
	 * local debug driver is overridden by whatever the server sends.
	 */
	private reconcileShips(entities: readonly EntityDelta[]): void {
		for (const e of entities) {
			if (this.kinds.cat(e.kind) !== Cat.Env) continue;
			if (this.kinds.ref(e.kind) !== SHIP_REF) continue;
			const facing = shipFacingFromSub(e.sub);
			this.shipFacing.set(e.eid, facing);
			this.shipTile.set(e.eid, { x: e.tile.x, y: e.tile.y });
			const ctl = this.shipCtl.get(e.eid);
			if (!ctl) continue;
			ctl.autoAdvance = false;
			ctl.setFacing(facing);
			// On the LOCAL pilot's ship, hand off to the 3D space scene the moment the
			// leaving cutscene finishes — by then the server has taken ship + pilot
			// off-grid (they vanish from the next snapshot for everyone else).
			if (e.eid === this.pilots.get(this.myEid)) {
				ctl.onTransition = (from) => {
					if (from === 'leaving') {
						// Detach the camera BEFORE the scene pauses + the ship sprite is
						// destroyed (off-grid). Otherwise, on resume Phaser's camera update
						// reads the dead sprite and crashes — the per-frame guard can't run
						// while paused.
						this.cameras.main.stopFollow();
						this.camFollowTarget = undefined;
						this.camFollowing = 'player';
						emitSpaceEnter({ heading: facing });
					}
				};
			} else if (ctl.onTransition) {
				ctl.onTransition = null;
			}
			const phase = shipPhaseFromSub(e.sub);
			ctl.setState(SHIP_PHASE_TO_STATE[phase] ?? 'off');
			// Airborne (any phase but OFF) → drop its footprint from prediction so the
			// local pilot isn't blocked by its own hull (matches the server).
			if (phase === 0) this.flyingShips.delete(e.eid);
			else this.flyingShips.add(e.eid);
			// Streamed sub-tile position (qx/qy ÷ 32) for the smooth-flight pass.
			if (e.qx !== undefined && e.qy !== undefined) {
				this.shipPos.set(e.eid, { x: e.qx / 32, y: e.qy / 32 });
			}
			// Fly sub-state from the streamed velocity (idle when ~stopped, else
			// cruise). qvx/qvy are velocity quantized ×256 (proto VEL_SCALE).
			const speed = Math.hypot(e.qvx ?? 0, e.qvy ?? 0) / 256;
			ctl.setMotion({ speed, turnRate: 0 });
		}
	}

	private reconcileTrees(entities: readonly EntityDelta[]): void {
		const seen = new Set<number>();
		for (const e of entities) {
			if (this.kinds.cat(e.kind) !== Cat.Env) continue;
			if (this.kinds.ref(e.kind) !== TREE_REF) continue;
			seen.add(e.eid);
			const { variant, felled } = decodeTreeSub(e.sub);
			const prev = this.treeState.get(e.eid);
			if (!prev) {
				this.treeState.set(e.eid, { variant, felled });
				continue;
			}
			if (felled && !prev.felled) {
				const refs = this.store.refs(e.eid);
				const sprite = refs?.sprite;
				if (sprite instanceof Phaser.GameObjects.Sprite) {
					const toRight = ((e.tile.x + e.tile.y) & 1) === 0;
					fellTreeSprite(this, sprite, toRight);
				}
				this.markEnvDirty();
			}
			prev.variant = variant;
			prev.felled = felled;
		}
		for (const eid of [...this.treeState.keys()]) {
			if (!seen.has(eid)) this.treeState.delete(eid);
		}
	}

	private refreshEnvBlocked(): void {
		this.envBlocked.clear();
		// Predicted (standing) trees the server hasn't realised yet still block.
		for (const key of this.predictedTrees.keys()) this.envBlocked.add(key);
		for (const sid of this.store.serverIdsWith(Cat.Env)) {
			if (this.treeState.get(sid)?.felled) continue;
			const t = this.store.tile(sid);
			if (!t) continue;
			// The ship blocks a multi-tile hull diamond, not just its base tile —
			// mirror the server footprint so prediction collides identically.
			if (this.kinds.ref(this.store.kind(sid)) === SHIP_REF) {
				// Airborne ships tile-block nothing (the pilot would hit its own hull).
				if (this.flyingShips.has(sid)) continue;
				const facing = this.shipFacing.get(sid) ?? 0;
				for (const [fx, fy] of shipFootprint(t.x, t.y, facing)) {
					this.envBlocked.add(packTile(fx, fy));
				}
				continue;
			}
			this.envBlocked.add(packTile(t.x, t.y));
		}
		this.drawShipCollisionDebug();
	}

	// Debug overlay over the parked ship: cyan = the server-intended footprint
	// diamond (shared `shipFootprint` shape from the ship's authoritative tile),
	// red = the tiles the client `envBlocked` set actually blocks. Redrawn whenever
	// collision is rebuilt; aligned footprints show red fills nested in cyan outlines.
	private drawShipCollisionDebug(): void {
		if (!DEBUG_SHIP_COLLISION) return;
		if (!this.shipDbg)
			this.shipDbg = this.add.graphics().setDepth(DEPTH_UI - 1);
		const g = this.shipDbg;
		g.clear();
		let base: TileXY | null = null;
		let facing = 0;
		for (const sid of this.store.serverIdsWith(Cat.Env)) {
			if (this.kinds.ref(this.store.kind(sid)) !== SHIP_REF) continue;
			base = this.store.tile(sid) ?? null;
			facing = this.shipFacing.get(sid) ?? 0;
			break;
		}
		if (!base) return;
		const hw = TILE_W / 2;
		const hh = TILE_H / 2;
		const diamond = (tx: number, ty: number, scale: number) => {
			const c = worldToScreen(tx, ty);
			g.beginPath();
			g.moveTo(c.x, c.y - hh * scale);
			g.lineTo(c.x + hw * scale, c.y);
			g.lineTo(c.x, c.y + hh * scale);
			g.lineTo(c.x - hw * scale, c.y);
			g.closePath();
		};
		const tiles = shipFootprint(base.x, base.y, facing);
		// CYAN: server-intended footprint shape (full tile outline).
		g.lineStyle(2, 0x00ffff, 0.9);
		for (const [fx, fy] of tiles) {
			diamond(fx, fy, 1);
			g.strokePath();
		}
		// RED: tiles the client collision set actually blocks (inset fill).
		g.fillStyle(0xff0000, 0.35);
		for (const [fx, fy] of tiles) {
			if (!this.envBlocked.has(packTile(fx, fy))) continue;
			diamond(fx, fy, 0.6);
			g.fillPath();
		}
		// The oriented hull box is drawn live per-frame in drawShipObbLive() (green
		// while pushing), so it isn't redrawn here.
	}

	// Scan the 8 tiles around the player for a standing tree and ask the server to
	// fell it (server validates adjacency + state and broadcasts the result).
	private tryFellAdjacentTree(): boolean {
		if (!this.client || this.myEid < 0) return false;
		const me = this.store.tile(this.myEid);
		if (!me) return false;
		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				if (dx === 0 && dy === 0) continue;
				const tx = me.x + dx;
				const ty = me.y + dy;
				const hit = this.store.at(tx, ty, this.myEid);
				if (!hit) continue;
				if (this.kinds.ref(this.store.kind(hit.serverEid)) !== TREE_REF)
					continue;
				if (this.treeState.get(hit.serverEid)?.felled) continue;
				this.client.fell({ x: tx, y: ty });
				return true;
			}
		}
		return false;
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
		if (kind < 0) return false;
		if (this.syncResolvers.hostile(kind)) return true;
		// PvP: other players become valid targets on dungeon floors (z < 0). The
		// server enforces the same gate (pvp_allowed), so don't offer surface
		// players as targets — a shot there would just whiff server-side.
		return (
			!this.isSurface() &&
			serverEid !== this.myEid &&
			isPlayerKind(this.kinds, kind)
		);
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
				refs.lastHp = undefined; // Clear cache when hidden
				continue;
			}
			const result = drawHealthBarCached(
				refs.hpBar,
				refs.sprite.x,
				refs.sprite.y - refs.sprite.displayHeight - 8,
				hp,
				maxHp,
				refs.lastHp,
			);
			refs.lastHp = result.cache;
		}
	}

	private teardown() {
		this.ground?.shader.destroy();
		this.ground = undefined;
		this.offIntent?.();
		this.offIntent = undefined;
		this.offCorpseIntent?.();
		this.offCorpseIntent = undefined;
		this.offSpaceExit?.();
		this.offSpaceExit = undefined;
		this.client?.close();
		this.client = null;
		clearHud();
	}
}
