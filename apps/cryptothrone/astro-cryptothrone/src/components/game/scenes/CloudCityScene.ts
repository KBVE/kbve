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
	ACTION_ATTACK,
	ACTION_PICKUP,
	KIND_CAT_ITEM,
	KIND_CAT_NPC,
	KIND_CAT_PLAYER,
} from '@kbve/laser';
import type {
	CharacterEventData,
	Dir,
	Snapshot,
	KindEntry,
	ConnectionState,
} from '@kbve/laser';
import { getCtNetConfig } from '@/lib/net-config';
import { getNPCByRef, npcIdForRef, isHostileRef } from '../data/npcs';
import { getZone, DEFAULT_ZONE, type ZoneDef } from '../data/zones';
import {
	getZoneInteractables,
	interactableAt,
	type Interactable,
} from '../data/interactables';
import { EntityStore, type EntityCat } from '../ecs/store';

interface EntityRefs {
	sprite: Phaser.GameObjects.Sprite;
	charId: string;
	nameplate?: Phaser.GameObjects.Text;
	hpBar?: Phaser.GameObjects.Graphics;
}

const MAP_SCALE = 3;
const STEP_THROTTLE_MS = 60;
const SLOT_NONE = 0xffff;
const PLAYER_SPRITE_VARIANTS = 8;

const DIR_DELTA: Record<string, { x: number; y: number }> = {
	Up: { x: 0, y: -1 },
	Down: { x: 0, y: 1 },
	Left: { x: -1, y: 0 },
	Right: { x: 1, y: 0 },
};

function spriteVariantForName(name: string): number {
	let h = 2166136261;
	for (let i = 0; i < name.length; i++) {
		h ^= name.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return (h >>> 0) % PLAYER_SPRITE_VARIANTS;
}

function isTypingInDom(): boolean {
	const el = document.activeElement;
	if (!el) return false;
	const tag = el.tagName;
	return (
		tag === 'INPUT' ||
		tag === 'TEXTAREA' ||
		(el as HTMLElement).isContentEditable === true
	);
}

interface RefSprite {
	key: string;
	mapping?: number;
	anim?: string;
}

const REF_SPRITES: Record<string, RefSprite> = {
	cleric: { key: 'monks', mapping: 0 },
	merchant: { key: 'monks', mapping: 1 },
	soldier: { key: 'monks', mapping: 2 },
	king: { key: 'monks', mapping: 3 },
	goblin: { key: 'monks', mapping: 4 },
	'goblin-general': { key: 'monks', mapping: 5 },
	wolf: { key: 'monks', mapping: 6 },
	'crystal-bat': { key: 'monster_bird', anim: 'bird' },
};

const DEFAULT_NPC_SPRITE: RefSprite = { key: 'monks', mapping: 0 };

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
	private kindRegistry = new Map<number, KindEntry>();
	private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
	private wasd!: {
		up: Phaser.Input.Keyboard.Key;
		down: Phaser.Input.Keyboard.Key;
		left: Phaser.Input.Keyboard.Key;
		right: Phaser.Input.Keyboard.Key;
	};
	private attackKey!: Phaser.Input.Keyboard.Key;
	private entityDepth = 0;
	private lastStepAt = 0;
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
	private heartbeatTimer = 0;
	private lastAutoPickup = 0;
	private prevLevel = -1;
	private prevXp = -1;
	private hoverThrottle = 0;
	private laserUnsubs: (() => void)[] = [];
	private blocked = new Set<string>();
	private predicted = { x: 0, y: 0 };
	private predictedPath: { x: number; y: number }[] = [];
	private predictSeeded = false;

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
		this.interactKey = this.input.keyboard!.addKey(Codes.E, false);
		this.interactables = getZoneInteractables(this.zone.key);

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

		this.laserUnsubs.push(
			laserEvents.on('item:use', (data) => {
				const d = data as { ref: string };
				if (d?.ref) this.client?.useItem(d.ref);
			}),
			laserEvents.on('item:equip', (data) => {
				const d = data as { ref: string };
				if (d?.ref) this.client?.equipItem(d.ref);
			}),
			laserEvents.on('emote', (data) => {
				const d = data as { emoji: string };
				if (d?.emoji && this.myEid >= 0)
					this.showFloatingText(this.myEid, d.emoji, '#ffffff');
			}),
		);

		this.events.once('shutdown', () => {
			window.clearTimeout(this.slowTimer);
			window.clearInterval(this.heartbeatTimer);
			this.laserUnsubs.forEach((off) => off());
			this.laserUnsubs = [];
			this.netTerminal = true;
			this.client?.close();
		});
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
		client.on('itemUsed', (u) => {
			laserEvents.emit('item:used', u);
			if (u.heal > 0) {
				this.showFloatingText(this.myEid, `+${u.heal}`, '#4ade80');
			}
		});
		client.on('equipped', (e) => {
			laserEvents.emit('item:equipped', e);
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

	private kindCat(kind: number): number {
		return this.kindRegistry.get(kind)?.cat ?? KIND_CAT_NPC;
	}

	private kindRef(kind: number): string | null {
		return this.kindRegistry.get(kind)?.ref ?? null;
	}

	private catName(kind: number): EntityCat {
		const c = this.kindCat(kind);
		return c === KIND_CAT_PLAYER
			? 'player'
			: c === KIND_CAT_ITEM
				? 'item'
				: 'npc';
	}

	private makeSprite(
		kind: number,
		owner: number,
	): {
		sprite: Phaser.GameObjects.Sprite;
		mapping?: number;
	} {
		const cat = this.kindCat(kind);
		if (cat === KIND_CAT_PLAYER || this.kindRegistry.size === 0) {
			const sprite = this.add.sprite(0, 0, 'player');
			sprite.scale = 1.5;
			sprite.setDepth(this.entityDepth);
			const username = this.slotUsername.get(owner);
			const mapping = username ? spriteVariantForName(username) : 6;
			return { sprite, mapping };
		}
		if (cat === KIND_CAT_ITEM) {
			const sprite = this.add.sprite(0, 0, 'ground-item');
			sprite.scale = 1.5;
			sprite.setDepth(this.entityDepth - 0.5);
			return { sprite, mapping: undefined };
		}
		const ref = this.kindRef(kind);
		const conf = (ref && REF_SPRITES[ref]) || DEFAULT_NPC_SPRITE;
		const sprite = this.add.sprite(0, 0, conf.key);
		sprite.scale = 1.5;
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
			this.entityDepth + 1,
		);
	}

	private applySnapshot(snap: Snapshot) {
		const seen = new Set<number>();
		for (const pv of snap.players) {
			this.slotUsername.set(pv.slot, pv.kbve_username);
		}

		for (const e of snap.entities) {
			if (
				e.eid === this.myEid &&
				(e.hp !== this.myHp || e.max_hp !== this.myMaxHp)
			) {
				this.myHp = e.hp;
				this.myMaxHp = e.max_hp;
				laserEvents.emit('player:stats', {
					stats: { hp: e.hp, maxHp: e.max_hp },
				});
			}
			seen.add(e.eid);
			if (!this.store.has(e.eid)) {
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
				const ref = this.kindRef(e.kind);
				const cat = this.catName(e.kind);
				let label: string | undefined;
				if (cat === 'player') {
					label = this.slotUsername.get(e.owner);
				} else if (cat === 'npc') {
					label = ref ? (getNPCByRef(ref)?.name ?? ref) : undefined;
				}
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
						.setDepth(this.entityDepth + 2);
				}
				this.store.spawn(
					e.eid,
					{
						tile: { x: e.tile.x, y: e.tile.y },
						kind: e.kind,
						cat,
						owner: e.owner,
						hostile: !!(ref && isHostileRef(ref)),
						hp: e.hp,
						maxHp: e.max_hp,
					},
					refs,
				);
				if (
					cat === 'player' &&
					e.owner === this.mySlot &&
					this.myEid < 0
				) {
					this.myEid = e.eid;
					this.cameras.main.startFollow(sprite, true);
					this.predicted = { x: e.tile.x, y: e.tile.y };
					this.predictSeeded = true;
				}
			} else if (e.eid === this.myEid) {
				// Reconcile prediction: trust the local position unless it
				// drifts too far from authority (rejected move / lag spike),
				// then snap back to the server.
				const drift = Math.max(
					Math.abs(e.tile.x - this.predicted.x),
					Math.abs(e.tile.y - this.predicted.y),
				);
				if (drift > 2) {
					this.predicted = { x: e.tile.x, y: e.tile.y };
					const refs = this.store.refs(e.eid);
					if (refs) {
						this.gridEngine.setPosition(refs.charId, {
							x: e.tile.x,
							y: e.tile.y,
						});
					}
				}
				this.store.update(e.eid, {
					tile: { ...this.predicted },
					hp: e.hp,
					maxHp: e.max_hp,
				});
			} else {
				const cur = this.store.tile(e.eid);
				const refs = this.store.refs(e.eid);
				if (cur && refs && (cur.x !== e.tile.x || cur.y !== e.tile.y)) {
					this.gridEngine.moveTo(refs.charId, {
						x: e.tile.x,
						y: e.tile.y,
					});
				}
				this.store.update(e.eid, {
					tile: { x: e.tile.x, y: e.tile.y },
					hp: e.hp,
					maxHp: e.max_hp,
				});
			}
		}

		for (const [serverEid, , refs] of [...this.store.entries()]) {
			if (seen.has(serverEid)) continue;
			if (this.gridEngine.hasCharacter(refs.charId)) {
				this.gridEngine.removeCharacter(refs.charId);
			}
			refs.hpBar?.destroy();
			refs.nameplate?.destroy();
			refs.sprite.destroy();
			this.store.despawn(serverEid);
			if (serverEid === this.myEid) this.myEid = -1;
			if (this.pendingAction?.eid === serverEid)
				this.pendingAction = null;
		}

		this.checkHostileProximity();
		this.syncRoster(snap);
		this.runPendingAction();
		const DAY_MS = 600000;
		laserEvents.emit('world:time', {
			phase: (snap.server_time_ms % DAY_MS) / DAY_MS,
		});
	}

	private runPendingAction() {
		const pending = this.pendingAction;
		if (!pending || !this.client) return;
		const me = this.myTile();
		const targetTile = this.store.tile(pending.eid);
		if (!me || !targetTile) {
			this.pendingAction = null;
			return;
		}
		if (this.chebyshev(me, targetTile) > 1) return;
		this.pendingAction = null;
		if (pending.kind === 'pickup') {
			this.client.action(ACTION_PICKUP, pending.eid);
			return;
		}
		const ref = this.kindRef(this.store.kind(pending.eid));
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
		});
	}

	private flashSprite(eid: number) {
		const refs = this.store.refs(eid);
		if (!refs) return;
		flashEntity(this, refs.sprite);
	}

	private updateHpBars() {
		for (const [serverEid, , refs] of this.store.entries()) {
			const cat = this.kindCat(this.store.kind(serverEid));
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
				refs.hpBar = this.add.graphics().setDepth(this.entityDepth + 1);
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
			const ref = this.kindRef(this.store.kind(serverEid));
			if (!ref || !isHostileRef(ref)) continue;
			const t = this.store.tile(serverEid);
			if (t && this.chebyshev(me, t) <= 3) count += 1;
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

	private chebyshev(
		a: { x: number; y: number },
		b: { x: number; y: number },
	): number {
		return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
	}

	private entityAt(tile: { x: number; y: number }): number | null {
		const hit = this.store.at(tile.x, tile.y, this.myEid);
		return hit ? hit.serverEid : null;
	}

	/**
	 * Nearest walkable tile next to `target` (NPCs occupy a solid tile, so you
	 * can't path onto it). Picks the neighbour closest to `from` so the player
	 * stops beside the NPC and the pending interaction can fire. Falls back to
	 * the target tile when fully boxed in.
	 */
	private adjacentFreeTile(
		target: { x: number; y: number },
		from: { x: number; y: number },
	): { x: number; y: number } {
		const deltas = [
			[0, -1],
			[0, 1],
			[-1, 0],
			[1, 0],
			[-1, -1],
			[1, -1],
			[-1, 1],
			[1, 1],
		];
		const free = deltas
			.map(([dx, dy]) => ({ x: target.x + dx, y: target.y + dy }))
			.filter(
				(c) =>
					!this.blocked.has(`${c.x},${c.y}`) &&
					this.entityAt(c) === null,
			);
		if (free.length === 0) return target;
		free.sort(
			(a, b) =>
				this.chebyshev(a, from) - this.chebyshev(b, from) ||
				Math.abs(a.x - from.x) +
					Math.abs(a.y - from.y) -
					(Math.abs(b.x - from.x) + Math.abs(b.y - from.y)),
		);
		return free[0];
	}

	private onPointerDown(pointer: Phaser.Input.Pointer) {
		if (!this.client) return;
		const span = this.tilePixels * MAP_SCALE;
		const tile = {
			x: Math.floor(pointer.worldX / span),
			y: Math.floor(pointer.worldY / span),
		};

		this.pendingAction = null;
		const hitEid = this.entityAt(tile);
		if (hitEid !== null) {
			const kind = this.store.kind(hitEid);
			const ref = this.kindRef(kind);
			const npc = ref ? getNPCByRef(ref) : undefined;
			const cat = this.kindCat(kind);
			laserEvents.emit('target:set', {
				eid: hitEid,
				name: npc?.name ?? ref ?? 'Unknown',
				hp: this.store.hp(hitEid),
				maxHp: this.store.maxHp(hitEid),
				cat,
			});
			const me = this.myTile();
			if (cat === KIND_CAT_ITEM) {
				if (me && this.chebyshev(me, tile) <= 1) {
					this.client.action(ACTION_PICKUP, hitEid);
				} else {
					this.pendingAction = { kind: 'pickup', eid: hitEid };
					this.startMoveTo(tile);
				}
				return;
			}
			if (cat === KIND_CAT_NPC) {
				if (ref && me && this.chebyshev(me, tile) <= 1) {
					const ev = pointer.event as MouseEvent | undefined;
					laserEvents.emit('npc:interact', {
						npcId: npcIdForRef(ref),
						npcName: npc?.name ?? ref,
						actions: npc?.actions ?? ['talk'],
						coords: {
							x: ev?.clientX ?? pointer.x,
							y: ev?.clientY ?? pointer.y,
						},
					});
				} else {
					this.pendingAction = { kind: 'interact', eid: hitEid };
					this.startMoveTo(
						me ? this.adjacentFreeTile(tile, me) : tile,
					);
				}
				return;
			}
		}

		laserEvents.emit('target:clear', {});
		this.startMoveTo(tile);
	}

	/**
	 * Predict a click-move client-side: pathfind locally over the same
	 * walkability the server uses (so the routes match) and walk it tile by
	 * tile, while the server runs its own authoritative MoveTo. Reconciliation
	 * snaps us back only if the two genuinely diverge.
	 */
	private startMoveTo(tile: { x: number; y: number }) {
		if (!this.client) return;
		this.predictedPath = findTilePath(this.predicted, tile, (x, y) =>
			this.blocked.has(`${x},${y}`),
		);
		this.client.moveTo(tile);
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
		let best: { eid: number; dist: number } | null = null;
		for (const [serverEid] of this.store.entries()) {
			if (serverEid === this.myEid) continue;
			if (this.kindCat(this.store.kind(serverEid)) !== KIND_CAT_NPC)
				continue;
			const t = this.store.tile(serverEid);
			if (!t) continue;
			const dist = this.chebyshev(me, t);
			if (dist <= 1 && (!best || dist < best.dist)) {
				best = { eid: serverEid, dist };
			}
		}
		if (best) {
			this.client.action(ACTION_ATTACK, best.eid);
		} else {
			this.showFloatingText(this.myEid, 'no target', '#9ca3af');
		}
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
		const eventData: CharacterEventData = { message: it.message };
		if (it.name) eventData.character_name = it.name;
		if (it.characterImage) eventData.character_image = it.characterImage;
		if (it.backgroundImage) eventData.background_image = it.backgroundImage;
		laserEvents.emit('char:event', eventData);
	}

	private updateOverlays(time: number) {
		for (const [, , refs] of this.store.entries()) {
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
				this.kindCat(this.store.kind(serverEid)) === KIND_CAT_PLAYER
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
			}
			const zone = this.zoneForTile(me);
			if (zone !== this.currentZone) {
				this.currentZone = zone;
				laserEvents.emit('zone:enter', { name: zone });
			}
		}
	}

	private zoneForTile(t: { x: number; y: number }): string {
		const near = (cx: number, cy: number, r: number) =>
			Math.max(Math.abs(t.x - cx), Math.abs(t.y - cy)) <= r;
		if (near(5, 12, 8)) return 'Cloud City Plaza';
		if (near(24, 24, 7)) return 'Goblin Camp';
		if (near(34, 30, 8)) return 'Crystal Cavern';
		return 'The Wilds';
	}

	private autoPickup(time: number) {
		if (!this.client || this.myEid < 0 || time - this.lastAutoPickup < 300)
			return;
		const me = this.myTile();
		if (!me) return;
		for (const [serverEid] of this.store.entries()) {
			if (this.kindCat(this.store.kind(serverEid)) !== KIND_CAT_ITEM)
				continue;
			const t = this.store.tile(serverEid);
			if (t && this.chebyshev(me, t) <= 1) {
				this.lastAutoPickup = time;
				this.client.action(ACTION_PICKUP, serverEid);
				return;
			}
		}
	}

	update(time: number) {
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

		if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
			this.tryInteract();
		}

		if (this.myEid < 0 || !this.predictSeeded) return;
		const myChar = `e${this.myEid}`;
		// One predicted tile at a time: wait for the local tween to finish so
		// prediction tracks the server's tile rate instead of outrunning it.
		if (this.gridEngine.isMoving(myChar)) return;

		let dir: Dir | null = null;
		if (this.cursors.up.isDown || this.wasd.up.isDown) dir = 'Up';
		else if (this.cursors.down.isDown || this.wasd.down.isDown)
			dir = 'Down';
		else if (this.cursors.left.isDown || this.wasd.left.isDown)
			dir = 'Left';
		else if (this.cursors.right.isDown || this.wasd.right.isDown)
			dir = 'Right';

		if (dir) {
			// Keyboard interrupts any click-path and predicts a single step.
			this.predictedPath = [];
			const delta = DIR_DELTA[dir];
			const cand = {
				x: this.predicted.x + delta.x,
				y: this.predicted.y + delta.y,
			};
			if (!this.blocked.has(`${cand.x},${cand.y}`)) {
				this.advancePredicted(myChar, cand);
			}
			this.client.step(dir);
			this.lastStepAt = time;
			return;
		}

		// Follow a predicted click-path one tile at a time (the server walks
		// its own authoritative MoveTo in parallel).
		if (this.predictedPath.length > 0) {
			const next = this.predictedPath.shift()!;
			if (!this.blocked.has(`${next.x},${next.y}`)) {
				this.advancePredicted(myChar, next);
			} else {
				this.predictedPath = [];
			}
		}
	}

	private advancePredicted(myChar: string, tile: { x: number; y: number }) {
		this.predicted = { ...tile };
		this.gridEngine.moveTo(myChar, tile);
		this.store.update(this.myEid, { tile: { ...tile } });
	}
}
