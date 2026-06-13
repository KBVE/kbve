import Phaser, { Scene } from 'phaser';
import {
	GameClient,
	laserEvents,
	createBirdAnimation,
	ACTION_ATTACK,
	ACTION_PICKUP,
	KIND_CAT_ITEM,
	KIND_CAT_NPC,
	KIND_CAT_PLAYER,
} from '@kbve/laser';
import type {
	Range,
	CharacterEventData,
	Dir,
	Snapshot,
	KindEntry,
} from '@kbve/laser';
import { getCtNetConfig } from '@/lib/net-config';
import { getNPCByRef, npcIdForRef, isHostileRef } from '../data/npcs';

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

interface Tracked {
	sprite: Phaser.GameObjects.Sprite;
	charId: string;
	tile: { x: number; y: number };
	kind: number;
	hp: number;
	maxHp: number;
	hpBar?: Phaser.GameObjects.Graphics;
	nameplate?: Phaser.GameObjects.Text;
}

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
	private tracked = new Map<number, Tracked>();
	private kindRegistry = new Map<number, KindEntry>();
	private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
	private attackKey!: Phaser.Input.Keyboard.Key;
	private entityDepth = 0;
	private lastStepAt = 0;
	private tilePixels = 16;
	private ranges: Range[] = [];
	private rangeTile = { x: -1, y: -1 };
	private myHp = -1;
	private myMaxHp = -1;
	private nearbyHostiles = 0;
	private slowTimer = 0;
	private reconnectTimer = 0;
	private netReady = false;
	private netTerminal = false;
	private reconnectAttempts = 0;
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

	create() {
		// mapdb GridTilemap (proto-canonical JSON): collision bitset + render
		// layers. Single source of truth shared with the server (simgrid) and
		// the client prediction BFS — no Tiled parsing.
		const tm = this.cache.json.get('cloud-city-tilemap') as {
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
			'cloud_tileset',
			'cloud-city-tiles',
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
		this.attackKey = this.input.keyboard!.addKey(
			Phaser.Input.Keyboard.KeyCodes.SPACE,
		);
		this.loadRanges();

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
			window.clearTimeout(this.reconnectTimer);
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
		client.on('open', () => {
			laserEvents.emit('net:status', { status: 'connected' });
		});
		client.on('welcome', (w) => {
			this.netReady = true;
			this.reconnectAttempts = 0;
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
		client.on('error', () => {
			if (this.netReady || this.netTerminal) return;
			window.clearTimeout(this.slowTimer);
			this.netTerminal = true;
			laserEvents.emit('net:status', {
				status: 'error',
				detail: 'Could not reach the game server. Check your connection and try again.',
			});
		});
		client.on('close', () => {
			window.clearTimeout(this.slowTimer);
			if (this.netTerminal) return;
			const wasReady = this.netReady;
			this.netReady = false;
			if (wasReady && this.reconnectAttempts < 3) {
				this.reconnectAttempts += 1;
				const attempt = this.reconnectAttempts;
				laserEvents.emit('net:status', {
					status: 'reconnecting',
					detail: `Connection dropped — reconnecting (attempt ${attempt}/3)…`,
				});
				this.reconnectTimer = window.setTimeout(
					() => this.connectClient(),
					1500 * 2 ** (attempt - 1),
				);
				return;
			}
			laserEvents.emit('net:status', {
				status: 'disconnected',
				detail: wasReady
					? 'You were disconnected from the world and reconnecting failed.'
					: 'The game server closed the connection before the world loaded.',
			});
		});
		laserEvents.emit('net:status', {
			status: this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting',
			detail:
				this.reconnectAttempts > 0
					? `Connection dropped — reconnecting (attempt ${this.reconnectAttempts}/3)…`
					: undefined,
		});
		this.slowTimer = window.setTimeout(() => {
			if (!this.netReady && !this.netTerminal) {
				laserEvents.emit('net:status', { status: 'slow' });
			}
		}, 8000);
		client.connect();

		this.heartbeatTimer = window.setInterval(() => {
			this.client?.heartbeat();
		}, 20000);

		// Camera zoom: +/- keys and mouse wheel, clamped.
		const zoom = (delta: number) => {
			const cam = this.cameras.main;
			cam.setZoom(Phaser.Math.Clamp(cam.zoom + delta, 0.6, 2.2));
		};
		this.input.keyboard?.on('keydown-PLUS', () => zoom(0.2));
		this.input.keyboard?.on('keydown-MINUS', () => zoom(-0.2));
		this.input.on(
			'wheel',
			(_p: unknown, _o: unknown, _dx: number, dy: number) =>
				zoom(dy > 0 ? -0.15 : 0.15),
		);
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
		const target = this.tracked.get(eid);
		if (!target) return;
		const label = this.add
			.text(target.sprite.x, target.sprite.y - 14, text, {
				fontFamily: 'monospace',
				fontSize: '14px',
				color,
				stroke: '#000000',
				strokeThickness: 3,
			})
			.setOrigin(0.5, 1)
			.setDepth(this.entityDepth + 1);
		this.tweens.add({
			targets: label,
			y: label.y - 28,
			alpha: 0,
			duration: 900,
			ease: 'Cubic.easeOut',
			onComplete: () => label.destroy(),
		});
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
			const existing = this.tracked.get(e.eid);
			if (!existing) {
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
				const tracked: Tracked = {
					sprite,
					charId,
					tile: { x: e.tile.x, y: e.tile.y },
					kind: e.kind,
					hp: e.hp,
					maxHp: e.max_hp,
				};
				if (this.kindCat(e.kind) === KIND_CAT_PLAYER) {
					const name = this.slotUsername.get(e.owner);
					if (name) {
						tracked.nameplate = this.add
							.text(sprite.x, sprite.y - 34, name, {
								fontFamily: 'monospace',
								fontSize: '11px',
								color: '#fcd34d',
								stroke: '#000000',
								strokeThickness: 3,
							})
							.setOrigin(0.5, 1)
							.setDepth(this.entityDepth + 2);
					}
				}
				this.tracked.set(e.eid, tracked);
				if (
					this.kindCat(e.kind) === KIND_CAT_PLAYER &&
					e.owner === this.mySlot &&
					this.myEid < 0
				) {
					this.myEid = e.eid;
					this.cameras.main.startFollow(sprite, true);
					this.predicted = { x: e.tile.x, y: e.tile.y };
					this.predictSeeded = true;
					// Seed range tracker to spawn so a range dialog only
					// fires when the player walks into a zone, not when
					// they spawn already standing in one.
					this.rangeTile = { x: e.tile.x, y: e.tile.y };
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
					this.gridEngine.setPosition(existing.charId, {
						x: e.tile.x,
						y: e.tile.y,
					});
				}
				existing.tile = { ...this.predicted };
				existing.hp = e.hp;
				existing.maxHp = e.max_hp;
			} else {
				if (
					existing.tile.x !== e.tile.x ||
					existing.tile.y !== e.tile.y
				) {
					this.gridEngine.moveTo(existing.charId, {
						x: e.tile.x,
						y: e.tile.y,
					});
					existing.tile = { x: e.tile.x, y: e.tile.y };
				}
				if (e.eid === this.myEid)
					this.predicted = { x: e.tile.x, y: e.tile.y };
				existing.hp = e.hp;
				existing.maxHp = e.max_hp;
			}
		}

		for (const [eid, t] of this.tracked) {
			if (seen.has(eid)) continue;
			if (this.gridEngine.hasCharacter(t.charId)) {
				this.gridEngine.removeCharacter(t.charId);
			}
			t.hpBar?.destroy();
			t.nameplate?.destroy();
			t.sprite.destroy();
			this.tracked.delete(eid);
			if (eid === this.myEid) this.myEid = -1;
			if (this.pendingAction?.eid === eid) this.pendingAction = null;
		}

		this.checkRanges();
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
		const target = this.tracked.get(pending.eid);
		if (!me || !target) {
			this.pendingAction = null;
			return;
		}
		if (this.chebyshev(me, target.tile) > 1) return;
		this.pendingAction = null;
		if (pending.kind === 'pickup') {
			this.client.action(ACTION_PICKUP, pending.eid);
			return;
		}
		const ref = this.kindRef(target.kind);
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
		const target = this.tracked.get(eid);
		if (!target) return;
		target.sprite.setTintFill(0xffffff);
		this.time.delayedCall(60, () => target.sprite.setTint(0xff6b6b));
		this.time.delayedCall(180, () => target.sprite.clearTint());
	}

	private updateHpBars() {
		for (const [, t] of this.tracked) {
			const cat = this.kindCat(t.kind);
			const wounded =
				cat === KIND_CAT_NPC &&
				t.maxHp > 0 &&
				t.hp < t.maxHp &&
				t.hp > 0;
			if (!wounded) {
				if (t.hpBar) {
					t.hpBar.destroy();
					t.hpBar = undefined;
				}
				continue;
			}
			if (!t.hpBar) {
				t.hpBar = this.add.graphics().setDepth(this.entityDepth + 1);
			}
			const w = 26;
			const pct = Math.max(0, Math.min(1, t.hp / t.maxHp));
			t.hpBar.clear();
			t.hpBar.fillStyle(0x000000, 0.6);
			t.hpBar.fillRect(t.sprite.x - w / 2, t.sprite.y - 30, w, 4);
			t.hpBar.fillStyle(
				pct > 0.5 ? 0x4ade80 : pct > 0.25 ? 0xfbbf24 : 0xf87171,
				1,
			);
			t.hpBar.fillRect(
				t.sprite.x - w / 2 + 0.5,
				t.sprite.y - 29.5,
				(w - 1) * pct,
				3,
			);
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
		for (const [eid, t] of this.tracked) {
			if (eid === this.myEid) continue;
			const ref = this.kindRef(t.kind);
			if (!ref || !isHostileRef(ref)) continue;
			if (this.chebyshev(me, t.tile) <= 3) count += 1;
		}
		if (count > 0 && this.nearbyHostiles === 0) {
			laserEvents.emit('monster:nearby', { count });
		}
		this.nearbyHostiles = count;
	}

	private myTile(): { x: number; y: number } | null {
		if (this.myEid < 0) return null;
		return this.tracked.get(this.myEid)?.tile ?? null;
	}

	private chebyshev(
		a: { x: number; y: number },
		b: { x: number; y: number },
	): number {
		return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
	}

	private entityAt(tile: {
		x: number;
		y: number;
	}): { eid: number; t: Tracked } | null {
		for (const [eid, t] of this.tracked) {
			if (eid === this.myEid) continue;
			if (t.tile.x === tile.x && t.tile.y === tile.y) {
				return { eid, t };
			}
		}
		return null;
	}

	private onPointerDown(pointer: Phaser.Input.Pointer) {
		if (!this.client) return;
		const span = this.tilePixels * MAP_SCALE;
		const tile = {
			x: Math.floor(pointer.worldX / span),
			y: Math.floor(pointer.worldY / span),
		};

		this.pendingAction = null;
		const hit = this.entityAt(tile);
		if (hit) {
			const ref = this.kindRef(hit.t.kind);
			const npc = ref ? getNPCByRef(ref) : undefined;
			laserEvents.emit('target:set', {
				eid: hit.eid,
				name: npc?.name ?? ref ?? 'Unknown',
				hp: hit.t.hp,
				maxHp: hit.t.maxHp,
				cat: this.kindCat(hit.t.kind),
			});
			const cat = this.kindCat(hit.t.kind);
			const me = this.myTile();
			if (cat === KIND_CAT_ITEM) {
				if (me && this.chebyshev(me, tile) <= 1) {
					this.client.action(ACTION_PICKUP, hit.eid);
				} else {
					this.pendingAction = { kind: 'pickup', eid: hit.eid };
					this.client.moveTo(tile);
				}
				return;
			}
			if (cat === KIND_CAT_NPC) {
				const ref = this.kindRef(hit.t.kind);
				if (ref && me && this.chebyshev(me, tile) <= 1) {
					const npc = getNPCByRef(ref);
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
					this.pendingAction = { kind: 'interact', eid: hit.eid };
					this.client.moveTo(tile);
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
		this.predictedPath = this.findLocalPath(this.predicted, tile);
		this.client.moveTo(tile);
	}

	private findLocalPath(
		from: { x: number; y: number },
		to: { x: number; y: number },
	): { x: number; y: number }[] {
		if (
			(from.x === to.x && from.y === to.y) ||
			this.blocked.has(`${to.x},${to.y}`)
		)
			return [];
		// BFS mirroring the server (grid.rs find_path): neighbour order
		// up/down/left/right, shortest path, capped length — same inputs +
		// same tie-breaking keep client and server routes identical.
		const MAX = 64;
		const key = (x: number, y: number) => `${x},${y}`;
		const prev = new Map<string, string | null>();
		prev.set(key(from.x, from.y), null);
		const queue = [from];
		const dirs = [
			[0, -1],
			[0, 1],
			[-1, 0],
			[1, 0],
		];
		let found = false;
		while (queue.length) {
			const cur = queue.shift()!;
			if (cur.x === to.x && cur.y === to.y) {
				found = true;
				break;
			}
			for (const [dx, dy] of dirs) {
				const nx = cur.x + dx;
				const ny = cur.y + dy;
				const k = key(nx, ny);
				if (prev.has(k) || this.blocked.has(k)) continue;
				prev.set(k, key(cur.x, cur.y));
				queue.push({ x: nx, y: ny });
			}
		}
		if (!found) return [];
		const path: { x: number; y: number }[] = [];
		let cur: string | null = key(to.x, to.y);
		while (cur && cur !== key(from.x, from.y)) {
			const [x, y] = cur.split(',').map(Number);
			path.push({ x, y });
			cur = prev.get(cur) ?? null;
			if (path.length > MAX) return [];
		}
		path.reverse();
		return path;
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
		const hit = this.entityAt(tile);
		this.input.setDefaultCursor(hit ? 'pointer' : 'default');
	}

	private attackNearby() {
		if (!this.client) return;
		const me = this.myTile();
		if (!me) return;
		let best: { eid: number; dist: number } | null = null;
		for (const [eid, t] of this.tracked) {
			if (eid === this.myEid) continue;
			if (this.kindCat(t.kind) !== KIND_CAT_NPC) continue;
			const dist = this.chebyshev(me, t.tile);
			if (dist <= 1 && (!best || dist < best.dist)) {
				best = { eid, dist };
			}
		}
		if (best) {
			this.client.action(ACTION_ATTACK, best.eid);
		} else {
			this.showFloatingText(this.myEid, 'no target', '#9ca3af');
		}
	}

	private checkRanges() {
		if (this.myEid < 0) return;
		const me = this.tracked.get(this.myEid);
		if (!me) return;
		if (me.tile.x === this.rangeTile.x && me.tile.y === this.rangeTile.y) {
			return;
		}
		this.rangeTile = { x: me.tile.x, y: me.tile.y };
		for (const range of this.ranges) {
			const b = range.bounds;
			if (
				me.tile.x >= b.xMin &&
				me.tile.x <= b.xMax &&
				me.tile.y >= b.yMin &&
				me.tile.y <= b.yMax
			) {
				range.action();
				break;
			}
		}
	}

	private loadRanges() {
		this.ranges = [
			{
				name: 'well',
				bounds: { xMin: 2, xMax: 5, yMin: 10, yMax: 14 },
				action: () => {
					const eventData: CharacterEventData = {
						message:
							'Seems like there are no fish in the sand pits. This area could be fixed up a bit.',
					};
					laserEvents.emit('char:event', eventData);
				},
			},
			{
				name: 'sign',
				bounds: { xMin: 2, xMax: 5, yMin: 2, yMax: 5 },
				action: () => {
					const eventData: CharacterEventData = {
						message: 'Welcome to Cloud City!',
						character_name: 'Wooden Sign',
						background_image: '/assets/background/woodensign.webp',
					};
					laserEvents.emit('char:event', eventData);
				},
			},
			{
				name: 'tombstone',
				bounds: { xMin: 7, xMax: 10, yMin: 9, yMax: 10 },
				action: () => {
					const eventData: CharacterEventData = {
						message:
							'Samson the Great was an amazing sailor, died drinking dat drank.',
						character_name: 'Samson Statue',
						character_image: '/assets/npc/samson.png',
						background_image:
							'/assets/background/animetombstone.webp',
					};
					laserEvents.emit('char:event', eventData);
				},
			},
		];
	}

	private updateOverlays(time: number) {
		for (const [, t] of this.tracked) {
			if (t.nameplate) {
				t.nameplate.setPosition(t.sprite.x, t.sprite.y - 34);
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
		for (const [eid, t] of this.tracked) {
			if (
				eid !== this.myEid &&
				this.kindCat(t.kind) === KIND_CAT_PLAYER
			) {
				others.push({ x: t.tile.x, y: t.tile.y });
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
		for (const [eid, t] of this.tracked) {
			if (this.kindCat(t.kind) !== KIND_CAT_ITEM) continue;
			if (this.chebyshev(me, t.tile) <= 1) {
				this.lastAutoPickup = time;
				this.client.action(ACTION_PICKUP, eid);
				return;
			}
		}
	}

	update(time: number) {
		if (!this.client) return;
		this.updateHpBars();
		this.updateOverlays(time);
		this.autoPickup(time);

		if (Phaser.Input.Keyboard.JustDown(this.attackKey)) {
			this.attackNearby();
		}

		if (this.myEid < 0 || !this.predictSeeded) return;
		const myChar = `e${this.myEid}`;
		// One predicted tile at a time: wait for the local tween to finish so
		// prediction tracks the server's tile rate instead of outrunning it.
		if (this.gridEngine.isMoving(myChar)) return;

		let dir: Dir | null = null;
		if (this.cursors.up.isDown) dir = 'Up';
		else if (this.cursors.down.isDown) dir = 'Down';
		else if (this.cursors.left.isDown) dir = 'Left';
		else if (this.cursors.right.isDown) dir = 'Right';

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
		const me = this.tracked.get(this.myEid);
		if (me) me.tile = { ...tile };
	}
}
