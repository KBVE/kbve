import { Scene } from 'phaser';

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

		this.load.image('cloud-city-tiles', '/assets/map/cloud_tileset.png');
		this.load.tilemapTiledJSON(
			'cloud-city-map-large',
			'/assets/map/cloud_city_large.json',
		);

		this.load.spritesheet(
			'player',
			'https://kbve.com/assets/img/fishchip/chip_charactersheet_warmer.png',
			{ frameWidth: 52, frameHeight: 72 },
		);

		this.load.spritesheet('monks', '/assets/entity/monks.png', {
			frameWidth: 52,
			frameHeight: 72,
		});

		this.load.spritesheet(
			'monster_bird',
			'/assets/monster/bird_original.png',
			{ frameWidth: 61, frameHeight: 57 },
		);
	}

	create() {
		this.scene.start('CloudCity');
	}
}
