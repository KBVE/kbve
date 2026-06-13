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
const STEP_THROTTLE_MS = 90;
const SLOT_NONE = 0xffff;

interface RefSprite {
	key: string;
	mapping?: number;
	anim?: string;
}

const REF_SPRITES: Record<string, RefSprite> = {
	cleric: { key: 'monks', mapping: 0 },
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
}

interface PendingAction {
	kind: 'pickup' | 'interact';
	eid: number;
}

export class CloudCityScene extends Scene {
	private gridEngine: any;
	private client: GameClient | null = null;

	private mySlot = SLOT_NONE;
	private myEid = -1;
	private tracked = new Map<number, Tracked>();
	private registry = new Map<number, KindEntry>();
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
	private prevLevel = -1;
	private prevXp = -1;
	private hoverThrottle = 0;
	private laserUnsubs: (() => void)[] = [];

	constructor() {
		super({ key: 'CloudCity' });
	}

	create() {
		const tilemap = this.make.tilemap({ key: 'cloud-city-map-large' });
		this.tilePixels = tilemap.tileWidth;
		const tileset = tilemap.addTilesetImage(
			'cloud_tileset',
			'cloud-city-tiles',
		);
		for (let i = 0; i < tilemap.layers.length; i++) {
			const layer = tileset
				? tilemap.createLayer(i, tileset, 0, 0)
				: null;
			if (layer) {
				layer.setScale(MAP_SCALE);
				layer.setDepth(i);
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
			laserEvents.on('chat:send', (data) => {
				const d = data as { text: string };
				if (d?.text) this.client?.say(d.text);
			}),
		);

		this.events.once('shutdown', () => {
			window.clearTimeout(this.slowTimer);
			window.clearTimeout(this.reconnectTimer);
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
			this.registry.clear();
			for (const entry of w.registry ?? []) {
				this.registry.set(entry.kind, entry);
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
				`-${c.dmg}`,
				c.target === this.myEid ? '#f87171' : '#fbbf24',
			);
			this.flashSprite(c.target);
			if (c.died && c.target === this.myEid) {
				laserEvents.emit('char:event', {
					message:
						'You died! The well pulls you back to the plaza, body intact, pride bruised.',
				});
			}
		});
		client.on('chat', (c) => {
			laserEvents.emit('chat:message', c);
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
		return this.registry.get(kind)?.cat ?? KIND_CAT_NPC;
	}

	private kindRef(kind: number): string | null {
		return this.registry.get(kind)?.ref ?? null;
	}

	private makeSprite(kind: number): {
		sprite: Phaser.GameObjects.Sprite;
		mapping?: number;
	} {
		const cat = this.kindCat(kind);
		if (cat === KIND_CAT_PLAYER || this.registry.size === 0) {
			const sprite = this.add.sprite(0, 0, 'player');
			sprite.scale = 1.5;
			sprite.setDepth(this.entityDepth);
			return { sprite, mapping: 6 };
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
				const { sprite, mapping } = this.makeSprite(e.kind);
				const charId = `e${e.eid}`;
				const conf: Record<string, unknown> = {
					id: charId,
					sprite,
					startPosition: { x: e.tile.x, y: e.tile.y },
					speed: 4,
					collides: false,
				};
				if (mapping !== undefined) {
					conf.walkingAnimationMapping = mapping;
				}
				this.gridEngine.addCharacter(conf);
				this.tracked.set(e.eid, {
					sprite,
					charId,
					tile: { x: e.tile.x, y: e.tile.y },
					kind: e.kind,
					hp: e.hp,
					maxHp: e.max_hp,
				});
				if (
					this.kindCat(e.kind) === KIND_CAT_PLAYER &&
					e.owner === this.mySlot &&
					this.myEid < 0
				) {
					this.myEid = e.eid;
					this.cameras.main.startFollow(sprite, true);
				}
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
			t.sprite.destroy();
			this.tracked.delete(eid);
			if (eid === this.myEid) this.myEid = -1;
			if (this.pendingAction?.eid === eid) this.pendingAction = null;
		}

		this.checkRanges();
		this.checkHostileProximity();
		this.syncRoster(snap);
		this.runPendingAction();
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

	update(time: number) {
		if (!this.client) return;
		this.updateHpBars();

		if (Phaser.Input.Keyboard.JustDown(this.attackKey)) {
			this.attackNearby();
		}

		if (time - this.lastStepAt < STEP_THROTTLE_MS) return;

		let dir: Dir | null = null;
		if (this.cursors.up.isDown) dir = 'Up';
		else if (this.cursors.down.isDown) dir = 'Down';
		else if (this.cursors.left.isDown) dir = 'Left';
		else if (this.cursors.right.isDown) dir = 'Right';

		if (dir) {
			this.client.step(dir);
			this.lastStepAt = time;
		}
	}
}
