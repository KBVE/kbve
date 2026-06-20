import Phaser from 'phaser';
import {
	GameClient,
	ACTION_ATTACK,
	attachCameraZoom,
	flashEntity,
	floatingText,
	drawHealthBar,
	findTilePath,
	type Dir,
	type EntityDelta,
	type KindEntry,
	type Snapshot,
	type Welcome,
	type CombatEvent,
} from '@kbve/laser';
import {
	COLORS,
	GRID_SIZE,
	MOVE_TWEEN_MS,
	HEARTBEAT_MS,
	DEPTH_TILE,
	DEPTH_ENTITY_BASE,
	DEPTH_UI,
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
	stepDir,
	followPath,
	commitPredicted,
	type PredictState,
} from './systems/prediction';
import { makeSprite, makeNameplate, type EntityRefs } from './entities/sprites';
import { getNetConfig } from './net-config';

const TICK_MS = 120;

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
	private predictedPath: TileXY[] = [];
	private predictSeeded = false;
	private lastTick = 0;

	private syncBridge!: SyncBridge<EntityRefs>;
	private syncResolvers!: SyncResolvers;

	constructor() {
		super({ key: 'IsoArpgScene' });
	}

	create() {
		this.cameras.main.setBackgroundColor(COLORS.background);
		this.kinds = makeKindResolvers(this.kindRegistry);

		this.drawGrid();
		this.setupInput();
		this.buildBridge();
		attachCameraZoom(this, { min: 0.5, max: 2.0, step: 0.2 });

		this.connectClient();

		this.time.addEvent({
			delay: HEARTBEAT_MS,
			loop: true,
			callback: () => this.client?.heartbeat(),
		});

		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
	}

	private drawGrid() {
		const g = this.add.graphics();
		g.setDepth(DEPTH_TILE);
		for (let ty = 0; ty < GRID_SIZE; ty++) {
			for (let tx = 0; tx < GRID_SIZE; tx++) {
				const p = worldToScreen(tx, ty);
				this.drawDiamond(g, p.x, p.y);
			}
		}
		const center = worldToScreen(GRID_SIZE / 2, GRID_SIZE / 2);
		this.cameras.main.centerOn(center.x, center.y);
	}

	private drawDiamond(
		g: Phaser.GameObjects.Graphics,
		cx: number,
		cy: number,
	) {
		const hw = 32;
		const hh = 16;
		g.fillStyle(COLORS.tileFill, 1);
		g.lineStyle(1, COLORS.tileStroke, 1);
		g.beginPath();
		g.moveTo(cx, cy - hh);
		g.lineTo(cx + hw, cy);
		g.lineTo(cx, cy + hh);
		g.lineTo(cx - hw, cy);
		g.closePath();
		g.fillPath();
		g.strokePath();
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
				return;
			}
			this.startMoveTo(tile);
		});
	}

	private buildBridge() {
		this.syncBridge = {
			create: (e: EntityDelta, label) => {
				const hostile = this.syncResolvers.hostile(e.kind);
				const sprite = makeSprite(this, this.kinds, e.kind, hostile);
				this.placeSprite(sprite, e.tile.x, e.tile.y);
				const refs: EntityRefs = { sprite };
				if (label) {
					refs.nameplate = makeNameplate(this, label);
					this.placeNameplate(refs);
				}
				refs.hpBar = this.add.graphics().setDepth(DEPTH_UI);
				return refs;
			},
			move: (refs, tile) => this.tweenTo(refs, tile),
			setPos: (refs, tile) => this.placeRefs(refs, tile),
			follow: (refs) =>
				this.cameras.main.startFollow(refs.sprite, true, 0.12, 0.12),
			remove: (refs) => {
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

	update(time: number) {
		if (!this.client || !this.predictSeeded) return;
		if (time - this.lastTick < TICK_MS) return;
		this.lastTick = time;

		const myRefs = this.store.refs(this.myEid);
		if (!myRefs) return;

		const pstate: PredictState = {
			predicted: this.predicted,
			path: this.predictedPath,
			seeded: this.predictSeeded,
		};

		let dir: Dir | null = null;
		if (this.cursors.up.isDown || this.wasd.up.isDown) dir = 'Up';
		else if (this.cursors.down.isDown || this.wasd.down.isDown)
			dir = 'Down';
		else if (this.cursors.left.isDown || this.wasd.left.isDown)
			dir = 'Left';
		else if (this.cursors.right.isDown || this.wasd.right.isDown)
			dir = 'Right';

		if (dir) {
			const cand = stepDir(pstate, dir, this.isBlocked);
			if (cand) this.advance(pstate, myRefs, cand);
			this.predictedPath = pstate.path;
			this.predicted = pstate.predicted;
			this.client.step(dir);
			return;
		}

		const next = followPath(pstate, this.isBlocked);
		this.predictedPath = pstate.path;
		if (next) this.advance(pstate, myRefs, next);
		this.predicted = pstate.predicted;
	}

	private advance(pstate: PredictState, refs: EntityRefs, tile: TileXY) {
		commitPredicted(pstate, tile);
		this.tweenTo(refs, tile);
	}

	private startMoveTo(tile: TileXY) {
		if (!this.client) return;
		this.predictedPath = findTilePath(this.predicted, tile, this.isBlocked);
		this.client.moveTo(tile);
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
		this.placeNameplate(refs);
	}

	private tweenTo(refs: EntityRefs, tile: TileXY) {
		const p = worldToScreen(tile.x, tile.y);
		refs.sprite.setDepth(DEPTH_ENTITY_BASE + tileDepth(tile.x, tile.y));
		this.tweens.add({
			targets: refs.sprite,
			x: p.x,
			y: p.y + 8,
			duration: MOVE_TWEEN_MS,
			ease: 'Linear',
			onUpdate: () => this.placeNameplate(refs),
		});
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
			if (!refs.hpBar) continue;
			const hp = this.store.hp(serverEid);
			const maxHp = this.store.maxHp(serverEid);
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
