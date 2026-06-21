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
} from '@kbve/laser';
import {
	COLORS,
	GRID_SIZE,
	TILE_W,
	TILE_H,
	MOVE_TWEEN_MS,
	WALK_SPEED,
	RUN_SPEED,
	ARRIVE_DIST,
	HEARTBEAT_MS,
	DEPTH_TILE,
	DEPTH_ENTITY_BASE,
	DEPTH_UI,
	GROUND_TEXTURE_KEY,
	GROUND_TEXTURE_PATH,
	DEBUG_LOCAL_PLAYER,
	DEBUG_SPAWN_TILE,
} from './config';
import { worldToScreen, screenToWorld, tileDepth, type TileXY } from './iso';
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
import { getNetConfig } from './net-config';

const LOCAL_PLAYER_EID = 1;
const LOCAL_PLAYER_KIND = 1;

export class IsoArpgScene extends Phaser.Scene {
	private client: GameClient | null = null;
	private store = new EntityStore<EntityRefs>();
	private kindRegistry = new Map<number, KindEntry>();
	private kinds!: KindResolvers;
	private slotUsername = new Map<number, string>();

	private blocked = new Set<string>();
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
	private moveTarget: TileXY | null = null;

	private syncBridge!: SyncBridge<EntityRefs>;
	private syncResolvers!: SyncResolvers;
	private hoverTile!: Phaser.GameObjects.Graphics;
	private localMode = false;

	constructor() {
		super({ key: 'IsoArpgScene' });
	}

	preload() {
		this.load.image(GROUND_TEXTURE_KEY, GROUND_TEXTURE_PATH);
		preloadClass(this, RANGER_CLASS);
	}

	create() {
		this.cameras.main.setBackgroundColor(COLORS.background);
		this.kinds = makeKindResolvers(this.kindRegistry);
		registerClassAnims(this, RANGER_CLASS);

		this.drawGrid();
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
		// Seamless rock floor: one tiling base layer spanning the whole iso
		// footprint, clipped to the world diamond. No per-tile cuts, so the
		// texture reads continuous; tile feedback is a single cursor hover
		// highlight instead of a persistent grid (Diablo-style).
		this.drawGroundBase();
		this.hoverTile = this.makeHoverTile();
		const center = worldToScreen(GRID_SIZE / 2, GRID_SIZE / 2);
		this.cameras.main.centerOn(center.x, center.y);
	}

	private drawGroundBase() {
		// Lay the seamless rock on the ISO ground plane. Phaser applies a
		// GameObject's own scale BEFORE its rotation, so `rotate45 + scaleY .5`
		// on one TileSprite squashes the texture's local axis, not the screen —
		// it never lands on the diamond. Use a Container instead: the inner
		// TileSprite rotates 45° (grain runs along the tile axes); the parent
		// Container then squashes the already-rotated result 2:1 in screen
		// space. rotate-then-scale = the correct iso projection of a flat floor.
		const side = GRID_SIZE * TILE_W + TILE_W * 2;
		const center = worldToScreen(GRID_SIZE / 2, GRID_SIZE / 2);

		const floor = this.add.tileSprite(0, 0, side, side, GROUND_TEXTURE_KEY);
		floor.setOrigin(0.5, 0.5);
		floor.setRotation(-Math.PI / 4);

		const plane = this.add.container(center.x, center.y, [floor]);
		plane.setScale(1, 0.5);
		plane.setDepth(DEPTH_TILE);

		// Clip to the world diamond so the playable area has clean iso edges.
		const mask = this.make.graphics({});
		mask.fillStyle(0xffffff);
		mask.beginPath();
		const top = worldToScreen(0, 0);
		const right = worldToScreen(GRID_SIZE, 0);
		const bottom = worldToScreen(GRID_SIZE, GRID_SIZE);
		const left = worldToScreen(0, GRID_SIZE);
		mask.moveTo(top.x, top.y);
		mask.lineTo(right.x, right.y);
		mask.lineTo(bottom.x, bottom.y);
		mask.lineTo(left.x, left.y);
		mask.closePath();
		mask.fillPath();
		plane.setMask(mask.createGeometryMask());
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

		this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
			const tile = screenToWorld(pointer.worldX, pointer.worldY);
			if (this.isBlocked(tile.x, tile.y)) return;
			const hit = this.store.at(tile.x, tile.y, this.myEid);
			if (hit && this.isHostileServer(hit.serverEid)) {
				this.client?.action(ACTION_ATTACK, hit.serverEid);
				this.moveTarget = null;
				this.poseLocalPlayer('Attack', {
					dx: tile.x - this.floatState.pos.x,
					dy: tile.y - this.floatState.pos.y,
				});
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
				const refs: EntityRefs = isPlayerKind(this.kinds, e.kind)
					? this.makePlayerRefs(e.kind)
					: {
							sprite: makeSprite(
								this,
								this.kinds,
								e.kind,
								this.syncResolvers.hostile(e.kind),
							),
						};
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

		client.connect();
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
		applyEntitySync(
			s.entities,
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
		} else if (this.myEid >= 0) {
			reconcileFloat(this.floatState, this.predicted);
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

	update(time: number, delta: number) {
		// Smooth facing runs every frame (independent of the movement sim) so
		// the 16-dir turn curve stays fluid even between tile crossings.
		this.tickFacing();

		if ((!this.client && !this.localMode) || !this.predictSeeded) return;

		const myRefs = this.store.refs(this.myEid);
		if (myRefs) this.tickLocalMotion(myRefs, delta);
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
		if (refs.cls && refs.sprite instanceof Phaser.GameObjects.Sprite) {
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

		this.renderFloat(refs);

		// Keep the server roughly in sync: emit a cardinal step toward whatever
		// new tile the float body has entered. The server stays authoritative;
		// reconcileFloat soft-corrects any drift on the next snapshot.
		const tile = floatTile(this.floatState);
		if (tile.x !== prevTile.x || tile.y !== prevTile.y) {
			this.predicted = tile;
			const dir = tileStepDir(prevTile, tile);
			if (dir) this.client?.step(dir);
		}

		// A click destination drives intent until the body arrives. Clear it on
		// reaching the target OR on overshoot (velocity now points away), so the
		// float never orbits the goal stuck in Run.
		if (this.moveTarget) {
			const dx = this.moveTarget.x - this.floatState.pos.x;
			const dy = this.moveTarget.y - this.floatState.pos.y;
			const dist = Math.hypot(dx, dy);
			const overshot =
				dx * this.floatState.vel.x + dy * this.floatState.vel.y < 0;
			if (dist < ARRIVE_DIST || (overshot && dist < 1)) {
				this.moveTarget = null;
			}
		}
	}

	/** World-tile intent vector from held keys, else the click destination. */
	private readIntent(): TileXY {
		const ix =
			(this.cursors.right.isDown || this.wasd.right.isDown ? 1 : 0) -
			(this.cursors.left.isDown || this.wasd.left.isDown ? 1 : 0);
		const iy =
			(this.cursors.down.isDown || this.wasd.down.isDown ? 1 : 0) -
			(this.cursors.up.isDown || this.wasd.up.isDown ? 1 : 0);
		if (ix !== 0 || iy !== 0) {
			this.moveTarget = null; // keys override a click move
			return { x: ix, y: iy };
		}
		if (this.moveTarget) {
			return {
				x: this.moveTarget.x - this.floatState.pos.x,
				y: this.moveTarget.y - this.floatState.pos.y,
			};
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

	private startMoveTo(tile: TileXY) {
		if (!this.client && !this.localMode) return;
		this.moveTarget = { x: tile.x, y: tile.y };
		this.client?.moveTo(tile);
	}

	private isBlocked = (x: number, y: number): boolean => {
		if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) return true;
		return this.blocked.has(`${x},${y}`);
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
		const tile = { x: DEBUG_SPAWN_TILE.x, y: DEBUG_SPAWN_TILE.y };
		const refs = this.makePlayerRefs(kind);
		this.placeSprite(refs.sprite, tile.x, tile.y);
		this.syncShadow(refs);
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

	private poseLocalPlayer(
		state: 'Attack' | 'Death',
		facing?: { dx: number; dy: number },
	) {
		const refs = this.store.refs(this.myEid);
		if (!refs?.cls || !(refs.sprite instanceof Phaser.GameObjects.Sprite))
			return;
		setClassPose(refs.sprite, refs.cls, state, facing);
		if (state === 'Attack') {
			this.time.delayedCall(MOVE_TWEEN_MS * 2, () => {
				if (
					refs.cls &&
					refs.sprite instanceof Phaser.GameObjects.Sprite &&
					refs.cls.state === 'Attack'
				) {
					setClassPose(refs.sprite, refs.cls, 'Idle');
				}
			});
		}
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
			refs.sprite.y - refs.sprite.displayHeight - 14,
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
	}
}
