import { Scene } from 'phaser';
import {
	Quadtree,
	PlayerController,
	SideMap,
	laserEvents,
	getBirdNum,
	isBird,
	createBirdSprites,
	createShadowSprites,
	createBirdAnimation,
} from '@kbve/laser';
import type { Bounds2D, Range, CharacterEventData } from '@kbve/laser';
import {
	createGameWorld,
	spawnPlayer,
	spawnNpc,
	spawnMonster,
	type GameWorld,
} from '../ecs/world';
import { Position } from '../ecs/components';
import {
	monstersNearPlayer,
	nearestMonster,
	cullMonsters,
} from '../ecs/systems';

interface PositionChangeEvent {
	charId: string;
	exitTile: { x: number; y: number };
	enterTile: { x: number; y: number };
}

const MAP_SCALE = 3;
const AGGRO_RADIUS = 4;
const ACTIVE_RADIUS = 9;
const CULL_INTERVAL_MS = 250;

export class CloudCityScene extends Scene {
	private npcSprite: Phaser.GameObjects.Sprite | undefined;
	private monsterBirdSprites: Phaser.GameObjects.Sprite[] = [];
	private monsterBirdShadows: Phaser.GameObjects.Sprite[] = [];
	private gridEngine: any;
	private quadtree: Quadtree;
	private playerController: PlayerController | undefined;

	private world!: GameWorld;
	private playerEid = -1;
	private spriteByEid = new SideMap<Phaser.GameObjects.Sprite>();
	private shadowByEid = new SideMap<Phaser.GameObjects.Sprite>();
	private eidByChar = new Map<string, number>();
	private charByEid = new Map<number, string>();
	private monsterNearby = false;
	private lastCull = 0;

	constructor() {
		super({ key: 'CloudCity' });
		const bounds: Bounds2D = { xMin: 0, xMax: 50, yMin: 0, yMax: 50 };
		this.quadtree = new Quadtree(bounds);
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

		const worldWidth = tilemap.widthInPixels * MAP_SCALE;
		const worldHeight = tilemap.heightInPixels * MAP_SCALE;
		this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);

		const playerSprite = this.add.sprite(0, 0, 'player');
		playerSprite.setDepth(tilemap.layers.length);
		playerSprite.scale = 1.5;

		this.npcSprite = this.add.sprite(0, 0, 'monks');
		this.npcSprite.setDepth(tilemap.layers.length);
		this.npcSprite.scale = 1.5;

		this.cameras.main.startFollow(playerSprite, true);
		this.cameras.main.setFollowOffset(
			-playerSprite.width,
			-playerSprite.height,
		);

		createBirdAnimation(this);
		this.monsterBirdSprites = createBirdSprites(this);
		this.monsterBirdShadows = createShadowSprites(this);
		this.anims.staggerPlay('bird', this.monsterBirdSprites, 100);
		const entityDepth = tilemap.layers.length;
		this.monsterBirdShadows.forEach((s) => s.setDepth(entityDepth));
		this.monsterBirdSprites.forEach((s) => s.setDepth(entityDepth + 1));

		const gridEngineConfig = {
			characters: [
				{
					id: 'player',
					sprite: playerSprite,
					walkingAnimationMapping: 6,
					startPosition: { x: 5, y: 12 },
				},
				{
					id: 'npc',
					sprite: this.npcSprite,
					walkingAnimationMapping: 0,
					startPosition: { x: 4, y: 10 },
					speed: 3,
				},
				...this.monsterBirdSprites.map((sprite, i) => ({
					id: 'monster_bird_' + i,
					sprite,
					startPosition: { x: 7, y: 7 + i },
					speed: 5,
					collides: false,
				})),
				...this.monsterBirdShadows.map((sprite, i) => ({
					id: 'monster_bird_shadow_' + i,
					sprite,
					startPosition: { x: 7, y: 7 + i },
					speed: 5,
					collides: false,
				})),
			],
			numberOfDirections: 8,
		};

		this.gridEngine.create(tilemap, gridEngineConfig);
		this.loadRanges();

		this.playerController = new PlayerController(
			this,
			this.gridEngine,
			this.quadtree,
			{ tileSize: 48, joystick: true },
		);

		this.initEcs(playerSprite);

		this.gridEngine.moveRandomly('npc', 1500, 3);

		for (let i = 0; i < 10; i++) {
			this.gridEngine.moveRandomly('monster_bird_' + i, 1000, 20);
		}

		this.gridEngine
			.positionChangeStarted()
			.subscribe(({ charId, enterTile }: PositionChangeEvent) => {
				const eid = this.eidByChar.get(charId);
				if (eid !== undefined) {
					Position.x[eid] = enterTile.x;
					Position.y[eid] = enterTile.y;
				}
				if (isBird(charId)) {
					this.gridEngine.moveTo(
						'monster_bird_shadow_' + getBirdNum(charId),
						{ x: enterTile.x, y: enterTile.y },
					);
				}
			});
	}

	private initEcs(playerSprite: Phaser.GameObjects.Sprite) {
		this.world = createGameWorld();

		this.playerEid = spawnPlayer(this.world, 5, 12);
		this.bind(this.playerEid, 'player', playerSprite);

		if (this.npcSprite) {
			const npcEid = spawnNpc(this.world, 4, 10);
			this.bind(npcEid, 'npc', this.npcSprite);
		}

		this.monsterBirdSprites.forEach((sprite, i) => {
			const eid = spawnMonster(this.world, 7, 7 + i);
			this.bind(eid, 'monster_bird_' + i, sprite);
			const shadow = this.monsterBirdShadows[i];
			if (shadow) this.shadowByEid.set(eid, shadow);
		});
	}

	private bind(
		eid: number,
		charId: string,
		sprite: Phaser.GameObjects.Sprite,
	) {
		this.spriteByEid.set(eid, sprite);
		this.eidByChar.set(charId, eid);
		this.charByEid.set(eid, charId);
	}

	private setMonsterActive(eid: number, active: boolean) {
		const charId = this.charByEid.get(eid);
		if (!charId) return;
		const sprite = this.spriteByEid.get(eid);
		const shadow = this.shadowByEid.get(eid);
		sprite?.setVisible(active);
		shadow?.setVisible(active);
		const shadowChar = 'monster_bird_shadow_' + getBirdNum(charId);
		if (active) {
			this.gridEngine.moveRandomly(charId, 1000, 20);
		} else {
			this.gridEngine.stopMovement(charId);
			this.gridEngine.stopMovement(shadowChar);
		}
	}

	private updateProximity() {
		if (this.playerEid < 0) return;

		const near = monstersNearPlayer(
			this.world,
			this.playerEid,
			AGGRO_RADIUS,
		);

		if (near.length > 0 && !this.monsterNearby) {
			this.monsterNearby = true;
			const nearest = nearestMonster(
				this.world,
				this.playerEid,
				AGGRO_RADIUS,
			);
			const dx =
				Position.x[nearest ?? this.playerEid] -
				Position.x[this.playerEid];
			const dy =
				Position.y[nearest ?? this.playerEid] -
				Position.y[this.playerEid];
			laserEvents.emit('monster:nearby', {
				count: near.length,
				nearestEid: nearest ?? -1,
				distance: Math.round(Math.hypot(dx, dy)),
			});
		} else if (near.length === 0) {
			this.monsterNearby = false;
		}
	}

	private loadRanges() {
		const ranges: Range[] = [
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
				name: 'building',
				bounds: { xMin: 13, xMax: 13, yMin: 6, yMax: 7 },
				action: () => {
					const eventData: CharacterEventData = {
						message: 'Sorry, we are closed!',
						character_name: 'Evee The BarKeep',
						character_image: '/assets/npc/barkeep.webp',
						background_image: '/assets/background/animebar.webp',
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

		for (const range of ranges) {
			this.quadtree.insert(range);
		}
	}

	update(time: number) {
		this.playerController?.handleMovement();
		this.updateProximity();

		if (time - this.lastCull >= CULL_INTERVAL_MS) {
			this.lastCull = time;
			cullMonsters(
				this.world,
				this.playerEid,
				ACTIVE_RADIUS,
				(eid, active) => this.setMonsterActive(eid, active),
			);
		}
	}
}
