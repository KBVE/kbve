import Phaser from 'phaser';
import {
	GameClient,
	PROTOCOL_VERSION,
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
	BIOMES,
	biomeTextureKey,
	biomeTexturePath,
	USE_GROUND_SHADER,
	SURFACE_MIN_Z,
	DUNGEON_SEED,
	DUNGEON_RADIUS,
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
} from './systems/hud';
import {
	makeSprite,
	makeClassSprite,
	makeCreatureSprite,
	resetCreaturePose,
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
} from './entities/env';
import {
	preloadTrees,
	makeTreeSprite,
	reskinTreeSprite,
	fellTreeSprite,
	decodeTreeSub,
	treeAt,
	TREE_REF,
} from './entities/trees';
import { getNetConfig } from './net-config';
import { resolvePlayerName } from './playerName';

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
	private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
	private wasd!: Record<
		'up' | 'down' | 'left' | 'right',
		Phaser.Input.Keyboard.Key
	>;

	// True once the local player has spawned in-world: routes connection-state
	// changes to the in-game reconnect banner instead of the boot overlay.
	private bootReady = false;
	private static readonly MAX_RECONNECTS = 3;
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
	// Spell loadout (first 9 spelldb spells) + casting state.
	private spells: SpellState = makeSpellState();
	// Unsubscribe handle for HUD inventory intents (use/drop/reorder).
	private offIntent?: () => void;

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
			emitBoot({
				phase: 'assets',
				message: 'Loading assets',
				progress: p,
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
		preloadTrees(this);
		preloadStairs(this);
		preloadItemAtlas(this);
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

		this.connectClient();

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
		const refs = setupInputV(this, this.inputDeps());
		this.cursors = refs.cursors;
		this.wasd = refs.wasd;
		this.fireKey = refs.fireKey;
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
			useInventorySlot: (i) => this.useInventorySlot(i),
			castSpellSlot: (i) => this.castSpellSlot(i),
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
					} else {
						const envSprite = makeEnvSprite(
							this,
							this.kinds.ref(e.kind),
						);
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
					this.residency.acquire(
						this.creatureResource(view.def),
						() => {
							// The sprite may have been culled/destroyed while its sheets
							// loaded; only re-pose if it's still in the scene.
							if (sprite.scene) resetCreaturePose(sprite, view);
						},
					);
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
		client.on('floor', (f: FloorChangeEvent) => this.onFloorChange(f));
		client.on('inventory', (inv: InventorySync) => {
			setInventory(this.inv, inv.items);
		});
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
		this.reconcileTrees(onFloor);
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

	/** One-shot on-screen notice via laser's global `notification` event. */
	private flashMessage(text: string) {
		emitNotification({ title: '', message: text });
	}

	update(_time: number, delta: number) {
		tickCreatureInterpV(this, this.store);
		tickFacingV(this.store);
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
		// toward the cursor.
		if (Phaser.Input.Keyboard.JustDown(this.fireKey)) {
			if (!this.tryFellAdjacentTree()) {
				const ptr = this.input.activePointer;
				this.fireBowAt(screenToWorldF(ptr.worldX, ptr.worldY));
			}
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
			if (t) this.envBlocked.add(packTile(t.x, t.y));
		}
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
		this.ground?.shader.destroy();
		this.ground = undefined;
		this.offIntent?.();
		this.offIntent = undefined;
		this.client?.close();
		this.client = null;
		clearHud();
	}
}
