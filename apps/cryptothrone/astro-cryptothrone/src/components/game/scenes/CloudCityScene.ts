import { Scene } from 'phaser';
import {
	Quadtree,
	PlayerController,
	laserEvents,
	getBirdNum,
	isBird,
	createBirdSprites,
	createShadowSprites,
	createBirdAnimation,
} from '@kbve/laser';
import type { Bounds2D, Range, CharacterEventData } from '@kbve/laser';

interface PositionChangeEvent {
	charId: string;
	exitTile: { x: number; y: number };
	enterTile: { x: number; y: number };
}

export class CloudCityScene extends Scene {
	private npcSprite: Phaser.GameObjects.Sprite | undefined;
	private monsterBirdSprites: Phaser.GameObjects.Sprite[] = [];
	private monsterBirdShadows: Phaser.GameObjects.Sprite[] = [];
	private gridEngine: any;
	private quadtree: Quadtree;
	private playerController: PlayerController | undefined;

	constructor() {
		super({ key: 'CloudCity' });
		const bounds: Bounds2D = { xMin: 0, xMax: 50, yMin: 0, yMax: 50 };
		this.quadtree = new Quadtree(bounds);
	}

	create() {
		const tilemap = this.make.tilemap({ key: 'cloud-city-map-large' });
		tilemap.addTilesetImage('cloud_tileset', 'cloud-city-tiles');

		for (let i = 0; i < tilemap.layers.length; i++) {
			const layer = tilemap.createLayer(i, 'cloud_tileset', 0, 0);
			if (layer) {
				layer.scale = 3;
			}
		}

		const playerSprite = this.add.sprite(0, 0, 'player');
		playerSprite.scale = 1.5;

		this.npcSprite = this.add.sprite(0, 0, 'monks');
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
			{ tileSize: 48 },
		);

		this.gridEngine.moveRandomly('npc', 1500, 3);

		for (let i = 0; i < 10; i++) {
			this.gridEngine.moveRandomly('monster_bird_' + i, 1000, 20);
		}

		this.gridEngine
			.positionChangeStarted()
			.subscribe(({ charId, enterTile }: PositionChangeEvent) => {
				if (isBird(charId)) {
					this.gridEngine.moveTo(
						'monster_bird_shadow_' + getBirdNum(charId),
						{ x: enterTile.x, y: enterTile.y },
					);
				}
			});
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

	update() {
		this.playerController?.handleMovement();
	}
}
