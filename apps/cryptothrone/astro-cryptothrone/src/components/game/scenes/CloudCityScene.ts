import Phaser, { Scene } from 'phaser';
import {
	GameClient,
	laserEvents,
	createBirdAnimation,
	flashEntity,
	floatingText,
	drawHealthBar,
	attachCameraZoom,
	findTilePath,
	lineCast,
	BOW_RANGE,
	ACTION_ATTACK,
	ACTION_PICKUP,
	ACTION_SHOOT,
	KIND_CAT_ITEM,
	KIND_CAT_NPC,
	KIND_CAT_PLAYER,
} from '@kbve/laser';
import type {
	CharacterEventData,
	Snapshot,
	KindEntry,
	ConnectionState,
	BjActionKind,
	ProjectileEvent,
} from '@kbve/laser';
import { getCtNetConfig } from '@/lib/net-config';
import { getNPCByRef, npcIdForRef, isHostileRef } from '../data/npcs';
import { resolveNpcSprite } from '../data/npcVisuals';
import { getItemById } from '../data/itemdb';
import { atlasFrame } from '../data/itemAtlas.generated';
import { getZone, DEFAULT_ZONE, type ZoneDef } from '../data/zones';
import {
	getZoneInteractables,
	interactableAt,
	type Interactable,
} from '../data/interactables';
import { EntityStore } from '../ecs/store';
import {
	applyEntitySync,
	type SyncBridge,
	type SyncResolvers,
	type SyncState,
} from '../systems/netSync';
import {
	makeFloatState,
	floatTile,
	stepFloat,
	reconcileFloat,
	WALK_SPEED,
	RUN_SPEED,
	SIM_DT_MS,
	ARRIVE_DIST,
	WAYPOINT_REACH,
	type FloatState,
	type IsBlocked,
} from '../systems/floatMotion';
import {
	chebyshev,
	resolveClick,
	resolvePending,
	nearestAdjacentNpc,
	adjacentFreeTile,
	type ClickHit,
	type NpcEntry,
} from '../systems/interaction';
import {
	makeKindResolvers,
	type KindResolvers,
} from '../systems/kindResolvers';
import {
	spriteVariantForName,
	isTypingInDom,
	zoneLabelForTile,
} from '../systems/sceneHelpers';

interface EntityRefs {
	sprite: Phaser.GameObjects.Sprite;
	charId: string;
	nameplate?: Phaser.GameObjects.Text;
	hpBar?: Phaser.GameObjects.Graphics;
}

const MAP_SCALE = 3;
const SLOT_NONE = 0xffff;
const UI_DEPTH = 100000;

const CASINO_TABLE = { zone: 'cloud-city', tx: 6, ty: 8, w: 1.5, h: 2 };
// Shared table key; must match the server's `CASINO_TABLE_REF` byte-for-byte.
const CASINO_TABLE_REF = 'cloud-city:casino:6,8';

interface PendingAction {
	kind: 'pickup' | 'interact';
	eid: number;
}

export class CloudCityScene extends Scene {
	private gridEngine: any;
	private client: GameClient | null = null;

	private mySlot = SLOT_NONE;
	private slotUsername = new Map<number, string>();
	private myEid = -1;
	private store = new EntityStore<EntityRefs>();
	private syncBridge!: SyncBridge<EntityRefs>;
	private syncResolvers!: SyncResolvers;
	private kindRegistry = new Map<number, KindEntry>();
	private kinds: KindResolvers = makeKindResolvers(this.kindRegistry);
	private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
	private wasd!: {
		up: Phaser.Input.Keyboard.Key;
		down: Phaser.Input.Keyboard.Key;
		left: Phaser.Input.Keyboard.Key;
		right: Phaser.Input.Keyboard.Key;
	};
	private attackKey!: Phaser.Input.Keyboard.Key;
	private shootKey!: Phaser.Input.Keyboard.Key;
	private entityDepth = 0;
	private tilePixels = 16;
	private zone: ZoneDef = getZone(DEFAULT_ZONE);
	private interactables: Interactable[] = [];
	private interactKey!: Phaser.Input.Keyboard.Key;
	private myHp = -1;
	private myMaxHp = -1;
	private nearbyHostiles = 0;
	private slowTimer = 0;
	private netReady = false;
	private netTerminal = false;
	private rosterKey = '';
	private pendingAction: PendingAction | null = null;
	private fpsFrames = 0;
	private fpsAt = 0;
	private lastPosKey = '';
	private currentZone = '';
	private atCasino = false;
	private lastInteractRef: string | null = null;
	private heartbeatTimer = 0;
	private lastAutoPickup = 0;
	private prevLevel = -1;
	private prevXp = -1;
	private hoverThrottle = 0;
	private laserUnsubs: (() => void)[] = [];
	private blocked = new Set<string>();
	private readonly isBlocked: IsBlocked = (x, y) =>
		this.blocked.has(`${x},${y}`);
	private predicted = { x: 0, y: 0 };
	private predictSeeded = false;
	private lastWorldTimeMs = -100000;
	private floatState: FloatState = makeFloatState({ x: 0, y: 0 });
	private movePath: { x: number; y: number }[] = [];
	private moveSendAccumMs = 0;
	private wasMoving = false;
	private spriteOffset: { x: number; y: number } | null = null;

	constructor() {
		super({ key: 'CloudCity' });
	}

	init(data: { zone?: string }) {
		this.zone = getZone(data?.zone);
	}

	create() {
		// mapdb GridTilemap (proto-canonical JSON): collision bitset + render
		// layers. Single source of truth shared with the server (simgrid) and
		// the client prediction BFS — no Tiled parsing.
		const tm = this.cache.json.get(this.zone.tilemapKey) as {
			width: number;
			height: number;
			tileSize: number;
			blocked: boolean[];
			layers: { name: string; data: number[] }[];
			tilesetColumns: number;
		};
		this.tilePixels = tm.tileSize;
		const tilemap = this.make.tilemap({
			tileWidth: tm.tileSize,
			tileHeight: tm.tileSize,
			width: tm.width,
			height: tm.height,
		});
		const tileset = tilemap.addTilesetImage(
			this.zone.tilesetName,
			this.zone.tilesetKey,
			tm.tileSize,
			tm.tileSize,
		);
		tm.layers.forEach((layerDef, i) => {
			const layer = tileset
				? tilemap.createBlankLayer(layerDef.name, tileset)
				: null;
			if (!layer) return;
			layer.setScale(MAP_SCALE);
			layer.setDepth(i);
			for (let idx = 0; idx < layerDef.data.length; idx++) {
				const gid = layerDef.data[idx];
				if (gid > 0) {
					// Tiled gid (1-based) -> Phaser tileset index (0-based).
					layer.putTileAt(
						gid - 1,
						idx % tm.width,
						Math.floor(idx / tm.width),
					);
				}
			}
		});
		// Collision straight from the precomputed bitset (matches authority).
		for (let idx = 0; idx < tm.blocked.length; idx++) {
			if (tm.blocked[idx]) {
				this.blocked.add(
					`${idx % tm.width},${Math.floor(idx / tm.width)}`,
				);
			}
		}
		this.entityDepth = tilemap.layers.length + 1;
		this.placeProps();
		this.cameras.main.setBounds(
			0,
			0,
			tilemap.widthInPixels * MAP_SCALE,
			tilemap.heightInPixels * MAP_SCALE,
		);

		createBirdAnimation(this);
		this.makeGroundItemTexture();
		this.gridEngine.create(tilemap, {
			characters: [],
			numberOfDirections: 8,
		});
		this.cursors = this.input.keyboard!.createCursorKeys();
		const Codes = Phaser.Input.Keyboard.KeyCodes;
		this.wasd = {
			up: this.input.keyboard!.addKey(Codes.W, false),
			down: this.input.keyboard!.addKey(Codes.S, false),
			left: this.input.keyboard!.addKey(Codes.A, false),
			right: this.input.keyboard!.addKey(Codes.D, false),
		};
		this.attackKey = this.input.keyboard!.addKey(Codes.SPACE, false);
		this.shootKey = this.input.keyboard!.addKey(Codes.F, false);
		this.interactKey = this.input.keyboard!.addKey(Codes.E, false);
		this.interactables = getZoneInteractables(this.zone.key);
		this.initSyncSystems();

		const cfg = getCtNetConfig();
		if (!cfg) {
			laserEvents.emit('char:event', {
				message: 'Not signed in — reload the page and log in to play.',
			});
			return;
		}

		this.connectClient();

		this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) =>
			this.onPointerDown(pointer),
		);
		this.input.on('pointermove', (pointer: Phaser.Input.Pointer) =>
			this.onPointerMove(pointer),
		);

		this.events.on(
			Phaser.Scenes.Events.POST_UPDATE,
			this.renderLocalFloat,
			this,
		);

		this.laserUnsubs.push(
			laserEvents.on('item:use', (data) => {
				const d = data as { ref: string };
				if (d?.ref) this.client?.useItem(d.ref);
			}),
			laserEvents.on('item:equip', (data) => {
				const d = data as { ref: string };
				if (d?.ref) this.client?.equipItem(d.ref);
			}),
			laserEvents.on('shop:buy', (data) => {
				const d = data as { npc: number; itemRef: string; qty: number };
				if (d?.itemRef) this.client?.buyItem(d.npc, d.itemRef, d.qty);
			}),
			laserEvents.on('shop:sell', (data) => {
				const d = data as { npc: number; itemRef: string; qty: number };
				if (d?.itemRef) this.client?.sellItem(d.npc, d.itemRef, d.qty);
			}),
			laserEvents.on('blackjack:bet', (data) => {
				const d = data as { amount: number };
				if (typeof d?.amount === 'number')
					this.client?.placeBet(d.amount);
			}),
			laserEvents.on('blackjack:action', (data) => {
				const d = data as { kind: BjActionKind };
				if (d?.kind) this.client?.bjAction(d.kind);
			}),
			laserEvents.on('blackjack:insure', (data) => {
				const d = data as { amount: number };
				if (typeof d?.amount === 'number')
					this.client?.insure(d.amount);
			}),
			laserEvents.on('blackjack:leave', () => {
				this.atCasino = false;
				this.client?.leaveTable();
			}),
			laserEvents.on('emote', (data) => {
				const d = data as { emoji: string };
				if (d?.emoji && this.myEid >= 0)
					this.showFloatingText(this.myEid, d.emoji, '#ffffff');
			}),
		);

		this.events.once('shutdown', () => {
			this.events.off(
				Phaser.Scenes.Events.POST_UPDATE,
				this.renderLocalFloat,
				this,
			);
			window.clearTimeout(this.slowTimer);
			window.clearInterval(this.heartbeatTimer);
			this.laserUnsubs.forEach((off) => off());
			this.laserUnsubs = [];
			this.netTerminal = true;
			this.client?.close();
		});
	}

	private placeProps() {
		if (this.zone.key !== CASINO_TABLE.zone) return;
		const px = this.tilePixels * MAP_SCALE;
		const cx = (CASINO_TABLE.tx + CASINO_TABLE.w / 2) * px;
		const cy = (CASINO_TABLE.ty + CASINO_TABLE.h / 2) * px;
		const img = this.add.image(cx, cy, 'casino_table').setOrigin(0.5);
		const dispW = CASINO_TABLE.w * px;
		const aspect = img.height / img.width;
		const dispH = dispW * aspect;
		img.setDisplaySize(dispW, dispH).setDepth(
			this.entityDepth + cy + dispH / 2,
		);
	}

	private connectClient() {
		const cfg = getCtNetConfig();
		if (!cfg) return;

		const client = new GameClient({
			url: cfg.wsUrl,
			jwt: cfg.jwt,
			kbveUsername: cfg.username,
		});
		this.client = client;
		client.on('welcome', (w) => {
			this.netReady = true;
			window.clearTimeout(this.slowTimer);
			laserEvents.emit('net:status', { status: 'ready' });
			this.mySlot = w.your_slot;
			this.kindRegistry.clear();
			for (const entry of w.registry ?? []) {
				this.kindRegistry.set(entry.kind, entry);
			}
			// Reconnected while seated: reclaim the seat the server held open.
			if (this.atCasino) {
				this.client?.joinTable(CASINO_TABLE_REF);
			}
		});
		client.on('snapshot', (s) => this.applySnapshot(s));
		client.on('inventory', (inv) => {
			laserEvents.emit('inventory:sync', inv);
		});
		client.on('pickup', (p) => {
			laserEvents.emit('item:pickup', p);
		});
		client.on('combat', (c) => {
			laserEvents.emit('combat:event', c);
			this.showFloatingText(
				c.target,
				c.crit ? `CRIT ${c.dmg}!` : `-${c.dmg}`,
				c.crit
					? '#fb7185'
					: c.target === this.myEid
						? '#f87171'
						: '#fbbf24',
			);
			this.flashSprite(c.target);
			if (c.died && c.target === this.myEid) {
				laserEvents.emit('char:event', {
					message:
						'You died! The well pulls you back to the plaza, body intact, pride bruised.',
				});
			}
		});
		client.on('projectile', (p) => {
			this.animateProjectile(p);
		});
		client.on('itemUsed', (u) => {
			laserEvents.emit('item:used', u);
			if (u.heal > 0) {
				this.showFloatingText(this.myEid, `+${u.heal}`, '#4ade80');
			}
		});
		client.on('equipped', (e) => {
			laserEvents.emit('item:equipped', e);
		});
		client.on('shop', (r) => {
			laserEvents.emit('shop:result', r);
		});
		client.on('blackjackState', (s) => {
			laserEvents.emit('blackjack:state', s);
		});
		client.on('stats', (st) => {
			laserEvents.emit('player:stats', {
				stats: {
					level: st.level,
					xp: st.xp,
					xpNext: st.xp_next,
					maxHp: st.max_hp,
					attack: st.attack,
					kills: st.kills ?? 0,
				},
			});
			if (this.prevLevel >= 0 && st.level > this.prevLevel) {
				this.showFloatingText(this.myEid, 'LEVEL UP!', '#fbbf24');
				laserEvents.emit('notification', {
					title: `Level ${st.level}`,
					message: `Max HP ${st.max_hp}, attack ${st.attack}. Healed to full.`,
					notificationType: 'success',
				});
			} else if (
				this.prevXp >= 0 &&
				st.level === this.prevLevel &&
				st.xp > this.prevXp
			) {
				this.showFloatingText(
					this.myEid,
					`+${st.xp - this.prevXp} xp`,
					'#a78bfa',
				);
			}
			this.prevLevel = st.level;
			this.prevXp = st.xp;
		});
		client.on('reject', (reason) => {
			window.clearTimeout(this.slowTimer);
			this.netTerminal = true;
			laserEvents.emit('net:status', {
				status: 'rejected',
				reason,
				detail: `The server turned you away: ${reason}`,
			});
		});
		client.on('state', (st) => this.onNetState(st));
		this.slowTimer = window.setTimeout(() => {
			if (!this.netReady && !this.netTerminal) {
				laserEvents.emit('net:status', { status: 'slow' });
			}
		}, 8000);
		client.connect();

		this.heartbeatTimer = window.setInterval(() => {
			this.client?.heartbeat();
		}, 20000);

		attachCameraZoom(this);
	}

	/**
	 * Map the laser transport state (connecting/connected/reconnecting/closed)
	 * onto the app-level net:status the UI overlay renders. App-level statuses
	 * `ready`/`rejected`/`slow` are layered separately by welcome/reject/timer.
	 */
	private onNetState(st: ConnectionState) {
		switch (st.status) {
			case 'connecting':
				laserEvents.emit('net:status', { status: 'connecting' });
				break;
			case 'connected':
				laserEvents.emit('net:status', { status: 'connected' });
				break;
			case 'reconnecting':
				this.netReady = false;
				laserEvents.emit('net:status', {
					status: 'reconnecting',
					detail: `Connection dropped — reconnecting (attempt ${st.attempts}/3)…`,
				});
				break;
			case 'closed':
				window.clearTimeout(this.slowTimer);
				if (this.netTerminal) return;
				laserEvents.emit('net:status', {
					status: 'disconnected',
					detail: st.reason
						? `Disconnected: ${st.reason}`
						: 'The connection to the world was closed.',
				});
				break;
		}
	}

	private makeGroundItemTexture() {
		if (this.textures.exists('ground-item')) return;
		const g = this.add.graphics();
		g.fillStyle(0xfacc15, 1);
		g.fillCircle(8, 8, 5);
		g.lineStyle(1.5, 0xfde68a, 1);
		g.strokeCircle(8, 8, 6.5);
		g.generateTexture('ground-item', 16, 16);
		g.destroy();
	}

	private makeSprite(
		kind: number,
		owner: number,
	): {
		sprite: Phaser.GameObjects.Sprite;
		mapping?: number;
	} {
		const cat = this.kinds.cat(kind);
		if (cat === KIND_CAT_PLAYER || this.kindRegistry.size === 0) {
			const sprite = this.add.sprite(0, 0, 'player');
			sprite.scale = 1.5;
			sprite.setDepth(this.entityDepth);
			const username = this.slotUsername.get(owner);
			const mapping = username ? spriteVariantForName(username) : 6;
			return { sprite, mapping };
		}
		if (cat === KIND_CAT_ITEM) {
			const ref = this.kinds.ref(kind);
			const item = ref ? getItemById(ref) : undefined;
			const frame = item ? atlasFrame(item.key) : 0;
			const useAtlas = frame > 0 && this.textures.exists('items-atlas');
			const sprite = useAtlas
				? this.add.sprite(0, 0, 'items-atlas', frame)
				: this.add.sprite(0, 0, 'ground-item');
			// Atlas tiles are 64px; scale to a ~24px ground footprint (matches
			// the old 16px circle at 1.5x). The fallback keeps its native 1.5x.
			sprite.scale = useAtlas ? 0.375 : 1.5;
			sprite.setDepth(this.entityDepth - 0.5);
			return { sprite, mapping: undefined };
		}
		const ref = this.kinds.ref(kind);
		const conf = resolveNpcSprite(ref);
		const sprite = this.add.sprite(0, 0, conf.key);
		sprite.scale = conf.scale ?? 1.5;
		sprite.setDepth(this.entityDepth);
		if (conf.anim) sprite.play(conf.anim);
		return { sprite, mapping: conf.mapping };
	}

	private showFloatingText(eid: number, text: string, color: string) {
		const refs = this.store.refs(eid);
		if (!refs) return;
		floatingText(
			this,
			refs.sprite.x,
			refs.sprite.y - 14,
			text,
			color,
			UI_DEPTH,
		);
	}

	private initSyncSystems() {
		this.syncBridge = {
			create: (e, label) => {
				const { sprite, mapping } = this.makeSprite(e.kind, e.owner);
				const charId = `e${e.eid}`;
				const conf: Record<string, unknown> = {
					id: charId,
					sprite,
					startPosition: { x: e.tile.x, y: e.tile.y },
					speed: 7,
					collides: false,
				};
				if (mapping !== undefined) {
					conf.walkingAnimationMapping = mapping;
				}
				this.gridEngine.addCharacter(conf);
				const refs: EntityRefs = { sprite, charId };
				if (label) {
					const top = sprite.getTopCenter();
					refs.nameplate = this.add
						.text(top.x, top.y + 2, label, {
							fontFamily: 'monospace',
							fontSize: '11px',
							color: '#fcd34d',
							stroke: '#000000',
							strokeThickness: 3,
						})
						.setOrigin(0.5, 1)
						.setDepth(UI_DEPTH + 1);
				}
				return refs;
			},
			move: (refs, tile) => this.gridEngine.moveTo(refs.charId, tile),
			follow: (refs) => this.cameras.main.startFollow(refs.sprite, true),
			remove: (refs) => {
				if (this.gridEngine.hasCharacter(refs.charId)) {
					this.gridEngine.removeCharacter(refs.charId);
				}
				refs.hpBar?.destroy();
				refs.nameplate?.destroy();
				refs.sprite.destroy();
			},
		};
		this.syncResolvers = {
			cat: (kind) => this.kinds.catName(kind),
			hostile: (kind) => {
				const ref = this.kinds.ref(kind);
				return !!(ref && isHostileRef(ref));
			},
			label: (e, cat) => {
				if (cat === 'player') return this.slotUsername.get(e.owner);
				if (cat === 'npc') {
					const ref = this.kinds.ref(e.kind);
					return ref ? (getNPCByRef(ref)?.name ?? ref) : undefined;
				}
				return undefined;
			},
		};
	}

	private applySnapshot(snap: Snapshot) {
		for (const pv of snap.players) {
			this.slotUsername.set(pv.slot, pv.kbve_username);
		}

		const hadEid = this.myEid >= 0;
		const state: SyncState = {
			myEid: this.myEid,
			mySlot: this.mySlot,
			predicted: this.predicted,
			predictSeeded: this.predictSeeded,
		};
		const despawned = applyEntitySync(
			snap.entities,
			this.store,
			this.syncBridge,
			this.syncResolvers,
			state,
		);
		this.myEid = state.myEid;
		this.predicted = state.predicted;
		this.predictSeeded = state.predictSeeded;

		if (!hadEid && this.myEid >= 0) {
			this.floatState = makeFloatState(state.serverPos ?? this.predicted);
			this.captureSpriteOffset();
		} else if (this.myEid >= 0 && state.serverPos) {
			this.reconcilePlayer(
				state.serverPos,
				state.serverVel ?? { x: 0, y: 0 },
				state.inputAck ?? 0,
			);
		}
		if (this.myEid >= 0) this.predicted = floatTile(this.floatState);
		for (const eid of despawned) {
			if (this.pendingAction?.eid === eid) this.pendingAction = null;
		}

		if (this.myEid >= 0) {
			const hp = this.store.hp(this.myEid);
			const maxHp = this.store.maxHp(this.myEid);
			if (hp !== this.myHp || maxHp !== this.myMaxHp) {
				this.myHp = hp;
				this.myMaxHp = maxHp;
				laserEvents.emit('player:stats', { stats: { hp, maxHp } });
			}
		}

		this.checkHostileProximity();
		this.syncRoster(snap);
		this.runPendingAction();
		const DAY_MS = 1800000;
		if (
			snap.server_time_ms - this.lastWorldTimeMs >= 1000 ||
			snap.server_time_ms < this.lastWorldTimeMs
		) {
			this.lastWorldTimeMs = snap.server_time_ms;
			laserEvents.emit('world:time', {
				phase: (snap.server_time_ms % DAY_MS) / DAY_MS,
			});
		}
	}

	private runPendingAction() {
		const pending = this.pendingAction;
		if (!pending || !this.client) return;
		const me = this.myTile();
		const targetTile = this.store.tile(pending.eid);
		const outcome = resolvePending(pending.kind, me, targetTile ?? null);
		if (outcome === 'wait') return;
		this.pendingAction = null;
		if (outcome === 'cancel') return;
		if (outcome === 'pickup') {
			this.client.action(ACTION_PICKUP, pending.eid);
			return;
		}
		const ref = this.kinds.ref(this.store.kind(pending.eid));
		if (!ref) return;
		const npc = getNPCByRef(ref);
		laserEvents.emit('npc:interact', {
			npcId: npcIdForRef(ref),
			npcName: npc?.name ?? ref,
			actions: npc?.actions ?? ['talk'],
			coords: {
				x: window.innerWidth / 2,
				y: window.innerHeight / 2,
			},
			eid: pending.eid,
		});
	}

	private flashSprite(eid: number) {
		const refs = this.store.refs(eid);
		if (!refs) return;
		flashEntity(this, refs.sprite);
	}

	private updateHpBars() {
		for (const [serverEid, , refs] of this.store.entries()) {
			const cat = this.kinds.cat(this.store.kind(serverEid));
			const hp = this.store.hp(serverEid);
			const maxHp = this.store.maxHp(serverEid);
			// Entity-uniform: any wounded entity (player or NPC) gets a world
			// hp bar, except items and the local player (HUD shows that one).
			const wounded =
				cat !== KIND_CAT_ITEM &&
				serverEid !== this.myEid &&
				maxHp > 0 &&
				hp < maxHp &&
				hp > 0;
			if (!wounded) {
				if (refs.hpBar) {
					refs.hpBar.destroy();
					refs.hpBar = undefined;
				}
				continue;
			}
			if (!refs.hpBar) {
				refs.hpBar = this.add.graphics().setDepth(UI_DEPTH);
			}
			const center = refs.sprite.getTopCenter();
			drawHealthBar(refs.hpBar, center.x, refs.sprite.y - 22, hp, maxHp);
		}
	}

	private syncRoster(snap: Snapshot) {
		const players = snap.players
			.filter((p) => p.connected)
			.map((p) => ({ slot: p.slot, username: p.kbve_username }))
			.sort((a, b) => a.slot - b.slot);
		const key = players.map((p) => `${p.slot}:${p.username}`).join('|');
		if (key === this.rosterKey) return;
		this.rosterKey = key;
		laserEvents.emit('players:sync', { players });
	}

	private checkHostileProximity() {
		const me = this.myTile();
		if (!me) return;
		let count = 0;
		for (const [serverEid] of this.store.entries()) {
			if (serverEid === this.myEid) continue;
			const ref = this.kinds.ref(this.store.kind(serverEid));
			if (!ref || !isHostileRef(ref)) continue;
			const t = this.store.tile(serverEid);
			if (t && chebyshev(me, t) <= 3) count += 1;
		}
		if (count > 0 && this.nearbyHostiles === 0) {
			laserEvents.emit('monster:nearby', { count });
		}
		this.nearbyHostiles = count;
	}

	private myTile(): { x: number; y: number } | null {
		if (this.myEid < 0) return null;
		return this.store.tile(this.myEid);
	}

	private entityAt(tile: { x: number; y: number }): number | null {
		const hit = this.store.at(tile.x, tile.y, this.myEid);
		return hit ? hit.serverEid : null;
	}

	private onPointerDown(pointer: Phaser.Input.Pointer) {
		if (!this.client) return;
		const span = this.tilePixels * MAP_SCALE;
		const tile = {
			x: Math.floor(pointer.worldX / span),
			y: Math.floor(pointer.worldY / span),
		};

		this.pendingAction = null;
		const me = this.myTile();
		const inRange = me !== null && chebyshev(me, tile) <= 1;
		const hitEid = this.entityAt(tile);
		let hit: ClickHit | null = null;
		if (hitEid !== null) {
			const kind = this.store.kind(hitEid);
			const ref = this.kinds.ref(kind);
			const npc = ref ? getNPCByRef(ref) : undefined;
			hit = {
				eid: hitEid,
				cat: this.kinds.catName(kind),
				hasRef: ref !== null,
			};
			laserEvents.emit('target:set', {
				eid: hitEid,
				name: npc?.name ?? ref ?? 'Unknown',
				hp: this.store.hp(hitEid),
				maxHp: this.store.maxHp(hitEid),
				cat: this.kinds.cat(kind),
			});
		}

		const intent = resolveClick(hit, inRange);
		switch (intent.kind) {
			case 'pickup':
				this.client.action(ACTION_PICKUP, intent.eid);
				return;
			case 'pickup-move':
				this.pendingAction = { kind: 'pickup', eid: intent.eid };
				this.startMoveTo(tile);
				return;
			case 'interact': {
				const ref = this.kinds.ref(this.store.kind(intent.eid));
				const npc = ref ? getNPCByRef(ref) : undefined;
				const ev = pointer.event as MouseEvent | undefined;
				if (ref) {
					laserEvents.emit('npc:interact', {
						npcId: npcIdForRef(ref),
						npcName: npc?.name ?? ref,
						actions: npc?.actions ?? ['talk'],
						coords: {
							x: ev?.clientX ?? pointer.x,
							y: ev?.clientY ?? pointer.y,
						},
						eid: intent.eid,
					});
				}
				return;
			}
			case 'interact-move':
				this.pendingAction = { kind: 'interact', eid: intent.eid };
				this.startMoveTo(
					me
						? adjacentFreeTile(
								tile,
								me,
								this.isBlocked,
								(c) => this.entityAt(c) !== null,
							)
						: tile,
				);
				return;
			case 'move':
				laserEvents.emit('target:clear', {});
				this.startMoveTo(tile);
				return;
		}
	}

	/**
	 * Click-move: pathfind locally over the same walkability the server uses and
	 * walk the route as float waypoints (readIntent). No server MoveTo — the
	 * server mirrors the analog Move stream and reconcileFloat corrects drift.
	 */
	private startMoveTo(tile: { x: number; y: number }) {
		if (!this.client) return;
		this.movePath =
			findTilePath(this.predicted, tile, this.isBlocked) ?? [];
	}

	private onPointerMove(pointer: Phaser.Input.Pointer) {
		const now = this.time.now;
		if (now - this.hoverThrottle < 120) return;
		this.hoverThrottle = now;
		const span = this.tilePixels * MAP_SCALE;
		const tile = {
			x: Math.floor(pointer.worldX / span),
			y: Math.floor(pointer.worldY / span),
		};
		const hit = this.entityAt(tile) !== null;
		this.input.setDefaultCursor(hit ? 'pointer' : 'default');
	}

	private attackNearby() {
		if (!this.client) return;
		const me = this.myTile();
		if (!me) return;
		const npcs: NpcEntry[] = [];
		for (const [serverEid] of this.store.entries()) {
			if (serverEid === this.myEid) continue;
			if (this.kinds.cat(this.store.kind(serverEid)) !== KIND_CAT_NPC)
				continue;
			const t = this.store.tile(serverEid);
			if (t) npcs.push({ eid: serverEid, tile: t });
		}
		const target = nearestAdjacentNpc(me, npcs);
		if (target !== null) {
			this.client.action(ACTION_ATTACK, target);
		} else {
			this.showFloatingText(this.myEid, 'no target', '#9ca3af');
		}
	}

	private shootNearest() {
		if (!this.client) return;
		const me = this.myTile();
		if (!me) return;
		let best: number | null = null;
		let bestDist = Infinity;
		for (const [serverEid] of this.store.entries()) {
			if (serverEid === this.myEid) continue;
			if (this.kinds.cat(this.store.kind(serverEid)) !== KIND_CAT_NPC)
				continue;
			const t = this.store.tile(serverEid);
			if (!t) continue;
			const dist = Math.max(Math.abs(t.x - me.x), Math.abs(t.y - me.y));
			if (dist === 0 || dist > BOW_RANGE || dist >= bestDist) continue;
			const path = lineCast(me, t, BOW_RANGE, (p) =>
				this.isBlocked(p.x, p.y),
			);
			const last = path[path.length - 1];
			if (!last || last.x !== t.x || last.y !== t.y) continue;
			best = serverEid;
			bestDist = dist;
		}
		if (best !== null) {
			this.client.action(ACTION_SHOOT, best);
		} else {
			this.showFloatingText(this.myEid, 'no shot', '#9ca3af');
		}
	}

	private animateProjectile(ev: ProjectileEvent) {
		const refs = this.store.refs(ev.attacker);
		if (!refs) return;
		const px = this.tilePixels;
		const offX = refs.sprite.x - ev.from.x * px;
		const offY = refs.sprite.y - ev.from.y * px;
		const toX = ev.to.x * px + offX;
		const toY = ev.to.y * px + offY;
		const color = ev.hit ? 0xfcd34d : 0x9ca3af;
		const shot = this.add.rectangle(
			refs.sprite.x,
			refs.sprite.y,
			7,
			2,
			color,
		);
		shot.setDepth(UI_DEPTH);
		shot.setRotation(Math.atan2(toY - refs.sprite.y, toX - refs.sprite.x));
		this.tweens.add({
			targets: shot,
			x: toX,
			y: toY,
			duration: 140,
			onComplete: () => shot.destroy(),
		});
	}

	/**
	 * Fire the interactable the player is standing in, if any. Called only on
	 * an explicit interact press — never on movement — so sprite-less points
	 * of interest (signs, statues) don't pop dialogs as you walk past.
	 */
	private tryInteract() {
		if (this.myEid < 0) return;
		const me = this.myTile();
		if (!me) return;
		const it = interactableAt(this.interactables, me.x, me.y);
		if (!it) return;
		if (it.action === 'casino') {
			this.atCasino = true;
			this.client?.joinTable(CASINO_TABLE_REF);
			laserEvents.emit('blackjack:open', { table_ref: CASINO_TABLE_REF });
			return;
		}
		const eventData: CharacterEventData = { message: it.message };
		if (it.name) eventData.character_name = it.name;
		if (it.characterImage) eventData.character_image = it.characterImage;
		if (it.backgroundImage) eventData.background_image = it.backgroundImage;
		laserEvents.emit('char:event', eventData);
	}

	private updateOverlays(time: number) {
		for (const [, , refs] of this.store.entries()) {
			refs.sprite.setDepth(
				this.entityDepth +
					refs.sprite.y +
					refs.sprite.displayHeight / 2,
			);
			if (refs.nameplate) {
				const top = refs.sprite.getTopCenter();
				refs.nameplate.setPosition(top.x, top.y + 2);
			}
		}
		// FPS — emit roughly once per second.
		this.fpsFrames += 1;
		if (time - this.fpsAt >= 1000) {
			const fps = Math.round(
				(this.fpsFrames * 1000) / (time - this.fpsAt),
			);
			this.fpsAt = time;
			this.fpsFrames = 0;
			laserEvents.emit('perf:fps', { fps });
		}
		// Other players (for the minimap).
		const others: { x: number; y: number }[] = [];
		for (const [serverEid] of this.store.entries()) {
			if (
				serverEid !== this.myEid &&
				this.kinds.cat(this.store.kind(serverEid)) === KIND_CAT_PLAYER
			) {
				const t = this.store.tile(serverEid);
				if (t) others.push(t);
			}
		}
		laserEvents.emit('world:players', { players: others });
		// Player tile position.
		const me = this.myTile();
		if (me) {
			const key = `${me.x},${me.y}`;
			if (key !== this.lastPosKey) {
				this.lastPosKey = key;
				laserEvents.emit('player:position', { x: me.x, y: me.y });
				const here = interactableAt(this.interactables, me.x, me.y);
				const ref = here?.ref ?? null;
				if (ref !== this.lastInteractRef) {
					this.lastInteractRef = ref;
					laserEvents.emit('interact:prompt', {
						hint: here ? (here.hint ?? 'inspect') : null,
					});
				}
				if (this.atCasino && here?.action !== 'casino') {
					this.atCasino = false;
					this.client?.leaveTable();
					laserEvents.emit('blackjack:close', undefined);
				}
			}
			const zone = zoneLabelForTile(me);
			if (zone !== this.currentZone) {
				this.currentZone = zone;
				laserEvents.emit('zone:enter', { name: zone });
			}
		}
	}

	private autoPickup(time: number) {
		if (!this.client || this.myEid < 0 || time - this.lastAutoPickup < 300)
			return;
		const me = this.myTile();
		if (!me) return;
		for (const [serverEid] of this.store.entries()) {
			if (this.kinds.cat(this.store.kind(serverEid)) !== KIND_CAT_ITEM)
				continue;
			const t = this.store.tile(serverEid);
			if (t && chebyshev(me, t) <= 1) {
				this.lastAutoPickup = time;
				this.client.action(ACTION_PICKUP, serverEid);
				return;
			}
		}
	}

	update(time: number, delta: number) {
		if (!this.client) return;
		this.updateHpBars();
		this.updateOverlays(time);
		this.autoPickup(time);

		// Skip game keys while a text field (chat) owns focus so typing
		// W/A/S/D/space doesn't also drive the avatar.
		if (isTypingInDom()) return;

		if (Phaser.Input.Keyboard.JustDown(this.attackKey)) {
			this.attackNearby();
		}

		if (Phaser.Input.Keyboard.JustDown(this.shootKey)) {
			this.shootNearest();
		}

		if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
			this.tryInteract();
		}

		if (this.myEid < 0 || !this.predictSeeded) return;
		this.tickLocalMotion(delta);
	}

	/**
	 * Continuous float locomotion: keyboard or click-path feeds a world-tile
	 * intent into the float sim, which advances the body every frame, drives the
	 * gridEngine walk animation, and emits analog Move to the server every 50ms.
	 * The sprite is positioned from the float body in renderLocalFloat
	 * (POST_UPDATE) so gridEngine's tile tween never fights it.
	 */
	private tickLocalMotion(deltaMs: number) {
		const myChar = `e${this.myEid}`;
		const intent = this.readIntent();
		const prevTile = floatTile(this.floatState);
		const walking = this.cursors.shift?.isDown ?? false;
		const speed = walking ? WALK_SPEED : RUN_SPEED;
		stepFloat(this.floatState, intent, speed, this.isBlocked, deltaMs);

		const mag = Math.hypot(intent.x, intent.y);
		const moving = mag > 0;
		if (moving) {
			this.gridEngine.move(myChar, this.intentDir(intent));
		} else if (this.gridEngine.isMoving(myChar)) {
			this.gridEngine.stopMovement(myChar);
		}

		const tile = floatTile(this.floatState);
		if (tile.x !== prevTile.x || tile.y !== prevTile.y) {
			this.predicted = tile;
			this.store.update(this.myEid, { tile: { ...tile } });
		}

		this.moveSendAccumMs += deltaMs;
		// Flush a release (moving -> idle) immediately instead of waiting for the
		// 50ms cadence, so the server stops powering the held intent a throttle
		// window sooner — cuts the on-stop over-travel the client can't predict.
		const releaseEdge = this.wasMoving && !moving;
		if (releaseEdge || this.moveSendAccumMs >= 50) {
			this.moveSendAccumMs = 0;
			if (moving || this.wasMoving) {
				const mx = moving ? Math.round((intent.x / mag) * 127) : 0;
				const my = moving ? Math.round((intent.y / mag) * 127) : 0;
				this.client?.move(mx, my, !walking);
			}
			this.wasMoving = moving;
		}

		if (this.movePath.length === 1) {
			const goal = this.movePath[0];
			const dx = goal.x - this.floatState.pos.x;
			const dy = goal.y - this.floatState.pos.y;
			const dist = Math.hypot(dx, dy);
			const overshot =
				dx * this.floatState.vel.x + dy * this.floatState.vel.y < 0;
			if (dist < ARRIVE_DIST || (overshot && dist < 1))
				this.movePath = [];
		}
	}

	/**
	 * World-tile intent vector. Held keys win and cancel any click route;
	 * otherwise steer toward the current A* waypoint, popping it on arrival.
	 */
	private readIntent(): { x: number; y: number } {
		const ix =
			(this.cursors.right.isDown || this.wasd.right.isDown ? 1 : 0) -
			(this.cursors.left.isDown || this.wasd.left.isDown ? 1 : 0);
		const iy =
			(this.cursors.down.isDown || this.wasd.down.isDown ? 1 : 0) -
			(this.cursors.up.isDown || this.wasd.up.isDown ? 1 : 0);
		if (ix !== 0 || iy !== 0) {
			this.movePath = [];
			return { x: ix, y: iy };
		}

		while (this.movePath.length > 0) {
			const wp = this.movePath[0];
			const dx = wp.x - this.floatState.pos.x;
			const dy = wp.y - this.floatState.pos.y;
			const dist = Math.hypot(dx, dy);
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

	private intentDir(intent: { x: number; y: number }): string {
		if (Math.abs(intent.x) >= Math.abs(intent.y)) {
			return intent.x > 0 ? 'right' : 'left';
		}
		return intent.y > 0 ? 'down' : 'up';
	}

	private reconcilePlayer(
		serverPos: { x: number; y: number },
		serverVel: { x: number; y: number },
		ack: number,
	) {
		const unacked = this.client?.ackMoves(ack) ?? [];
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

	/** Capture gridEngine's fixed sprite-vs-tile pixel offset for float render. */
	private captureSpriteOffset() {
		const refs = this.store.refs(this.myEid);
		if (!refs) return;
		const span = this.tilePixels * MAP_SCALE;
		this.spriteOffset = {
			x: refs.sprite.x - this.predicted.x * span,
			y: refs.sprite.y - this.predicted.y * span,
		};
	}

	/** Draw the local sprite at its fractional float position (post gridEngine). */
	private renderLocalFloat() {
		if (this.myEid < 0 || !this.predictSeeded || !this.spriteOffset) return;
		const refs = this.store.refs(this.myEid);
		if (!refs) return;
		const span = this.tilePixels * MAP_SCALE;
		refs.sprite.x = this.floatState.pos.x * span + this.spriteOffset.x;
		refs.sprite.y = this.floatState.pos.y * span + this.spriteOffset.y;
		refs.sprite.setDepth(
			this.entityDepth + refs.sprite.y + refs.sprite.displayHeight / 2,
		);
	}
}
