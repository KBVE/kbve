import { Scene } from 'phaser';
import { getZone } from '../data/zones';
import { ATLAS_URL, TILE_SIZE } from '../data/itemAtlas.generated';

export class PreloaderScene extends Scene {
	constructor() {
		super('Preloader');
	}

	preload() {
		const progressBar = this.add.graphics();
		const progressBox = this.add.graphics();
		progressBox.fillStyle(0x222222, 0.8);
		progressBox.fillRect(240, 270, 320, 50);

		const loadingText = this.add
			.text(400, 250, 'Loading...', {
				font: '20px monospace',
				color: '#ffffff',
			})
			.setOrigin(0.5, 0.5);

		this.load.on('progress', (value: number) => {
			progressBar.clear();
			progressBar.fillStyle(0xffffff, 1);
			progressBar.fillRect(250, 280, 300 * value, 30);
		});

		this.load.on('complete', () => {
			progressBar.destroy();
			progressBox.destroy();
			loadingText.destroy();
		});

		const zone = getZone();
		this.load.image(zone.tilesetKey, zone.tilesetUrl);
		this.load.json(zone.tilemapKey, zone.tilemapUrl);

		this.load.spritesheet('player', '/assets/entity/charactersheet.png', {
			frameWidth: 52,
			frameHeight: 72,
		});

		this.load.spritesheet('monks', '/assets/entity/monks.png', {
			frameWidth: 52,
			frameHeight: 72,
		});

		this.load.spritesheet(
			'monster_bird',
			'/assets/monster/bird_original.png',
			{ frameWidth: 61, frameHeight: 57 },
		);

		this.load.spritesheet(
			'monster_bird_grey',
			'/assets/monster/bird_grey.png',
			{ frameWidth: 61, frameHeight: 57 },
		);

		// itemdb sprite atlas (slot index == item key); frame N == atlas cell N.
		this.load.spritesheet('items-atlas', ATLAS_URL, {
			frameWidth: TILE_SIZE,
			frameHeight: TILE_SIZE,
		});
	}

	create() {
		const params = new URLSearchParams(
			typeof window !== 'undefined' ? window.location.search : '',
		);
		const zone = params.get('zone');
		if (zone === 'town' || zone === 'dungeon') {
			const seed = Number(params.get('seed'));
			this.scene.start('ProceduralZone', {
				zone,
				seed: Number.isFinite(seed) && seed > 0 ? seed : undefined,
			});
			return;
		}
		this.scene.start('CloudCity');
	}
}
