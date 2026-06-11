import { Scene } from 'phaser';
import { GameClient, laserEvents, createBirdAnimation } from '@kbve/laser';
import type { Range, CharacterEventData, Dir, Snapshot } from '@kbve/laser';
import { getCtNetConfig } from '@/lib/net-config';

const MAP_SCALE = 3;
const STEP_THROTTLE_MS = 180;

const KIND_PLAYER = 0;
const KIND_MONK = 1;
const KIND_BIRD = 2;
const SLOT_NONE = 0xffff;

interface Tracked {
	sprite: Phaser.GameObjects.Sprite;
	charId: string;
	tile: { x: number; y: number };
}

export class CloudCityScene extends Scene {
	private gridEngine: any;
	private client: GameClient | null = null;

	private mySlot = SLOT_NONE;
	private myEid = -1;
	private tracked = new Map<number, Tracked>();
	private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
	private entityDepth = 0;
	private lastStepAt = 0;
	private ranges: Range[] = [];
	private rangeTile = { x: -1, y: -1 };

	constructor() {
		super({ key: 'CloudCity' });
	}

	create() {
		const tilemap = this.make.tilemap({ key: 'cloud-city-map-large' });
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
		this.gridEngine.create(tilemap, {
			characters: [],
			numberOfDirections: 8,
		});
		this.cursors = this.input.keyboard!.createCursorKeys();
		this.loadRanges();

		const cfg = getCtNetConfig();
		if (!cfg) {
			laserEvents.emit('char:event', {
				message: 'Not signed in — reload the page and log in to play.',
			});
			return;
		}

		const client = new GameClient({
			url: cfg.wsUrl,
			jwt: cfg.jwt,
			kbveUsername: cfg.username,
		});
		this.client = client;
		client.on('welcome', (w) => {
			this.mySlot = w.your_slot;
		});
		client.on('snapshot', (s) => this.applySnapshot(s));
		client.on('reject', (reason) => {
			laserEvents.emit('char:event', {
				message: `Server rejected the connection: ${reason}`,
			});
		});
		client.on('close', () => {
			laserEvents.emit('char:event', {
				message: 'Disconnected from the world.',
			});
		});
		client.connect();

		this.events.once('shutdown', () => this.client?.close());
	}

	private makeSprite(kind: number): {
		sprite: Phaser.GameObjects.Sprite;
		mapping?: number;
	} {
		let key = 'player';
		let mapping: number | undefined = 6;
		if (kind === KIND_MONK) {
			key = 'monks';
			mapping = 0;
		} else if (kind === KIND_BIRD) {
			key = 'monster_bird';
			mapping = undefined;
		}
		const sprite = this.add.sprite(0, 0, key);
		sprite.scale = 1.5;
		sprite.setDepth(this.entityDepth);
		if (kind === KIND_BIRD) sprite.play('bird');
		return { sprite, mapping };
	}

	private applySnapshot(snap: Snapshot) {
		const seen = new Set<number>();

		for (const e of snap.entities) {
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
				});
				if (
					e.kind === KIND_PLAYER &&
					e.owner === this.mySlot &&
					this.myEid < 0
				) {
					this.myEid = e.eid;
					this.cameras.main.startFollow(sprite, true);
				}
			} else if (
				existing.tile.x !== e.tile.x ||
				existing.tile.y !== e.tile.y
			) {
				this.gridEngine.moveTo(existing.charId, {
					x: e.tile.x,
					y: e.tile.y,
				});
				existing.tile = { x: e.tile.x, y: e.tile.y };
			}
		}

		for (const [eid, t] of this.tracked) {
			if (seen.has(eid)) continue;
			if (this.gridEngine.hasCharacter(t.charId)) {
				this.gridEngine.removeCharacter(t.charId);
			}
			t.sprite.destroy();
			this.tracked.delete(eid);
			if (eid === this.myEid) this.myEid = -1;
		}

		this.checkRanges();
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
