import { Scene } from 'phaser';

import { reloadItemDB } from '@kbve/laser';

export class Title extends Scene {
    mainMenuButtonImage: Phaser.GameObjects.Image | undefined;
    mainMenuButtonText: Phaser.GameObjects.Text | undefined;
    constructor() {
        super('Preloader');
    }

    preload() {
        this.load.image('mainBg', 'https://utfs.io/f/2c17f660-7f39-4edf-b83e-122a71014d99-6gflls.webp'); // Ensure you have a correct path to your logo image
        this.load.image('scroll', 'https://kbve.com/assets/img/fishchip/scroll.webp');
        this.load.audio('music', 'https://kbve.com/assets/img/fishchip/bg.ogg');
        this.load.image('creditsBg', 'https://utfs.io/f/2c17f660-7f39-4edf-b83e-122a71014d99-6gflls.webp');
        this.load.audio('type', 'https://kbve.com/assets/img/fishchip/type.mp3');
        this.load.spritesheet('fishing', 'https://kbve.com/assets/img/fishchip/animate.png', { frameWidth: 800, frameHeight: 600 });
        this.load.image('fish', 'https://kbve.com/assets/img/letter_logo.png');
        this.load.image('background', 'https://kbve.com/assets/img/fishchip/scaled_fish_menu_minigame.webp');
        //this.load.image('fish', 'https://kbve.com/assets/img/letter_logo.png');

        //  Cloud TileSet -> cloud_tileset.png
        this.load.image("tiles", "https://kbve.com/assets/img/fishchip/desert_tileset_1.png");
        this.load.image("cloud-city-tiles", "/assets/map/cloud_tileset.png");

        this.load.tilemapTiledJSON(
            "cloud-city-map-large",
            "/assets/map/cloud_city_large.json",
        );
        this.load.tilemapTiledJSON(
            "cloud-city-map",
            "https://kbve.com/assets/img/fishchip/cloud_city.json",
        );
        // /assets/img/fishchip/characters_filter.png
        this.load.spritesheet("player", "https://kbve.com/assets/img/fishchip/chip_charactersheet_warmer.png", {
            frameWidth: 52,
            frameHeight: 72,
        });

        this.load.spritesheet("knights", "/assets/entity/knights.png", {
            frameWidth: 52,
            frameHeight: 72,
        });

        this.load.spritesheet("jacko", "/assets/entity/jacko.png", {
            frameWidth: 52,
            frameHeight: 72,
        });

        this.load.spritesheet("monks", "/assets/entity/monks.png", {
            frameWidth: 52,
            frameHeight: 72,
        });

        reloadItemDB();

    }

    create() {
        if (!this.sound.get('music')?.isPlaying) {
            this.sound.add('music', { loop: true, volume: 0.1 }).play();
        }
        this.add.image(480, 480, 'mainBg').setScale(0.1);

        this.mainMenuButtonImage = this.add.image(480, 480, 'scroll').setAlpha(0.9).setScale(0.7, 0.2).setInteractive({ useHandCursor: true });
        ``
        this.mainMenuButtonText = this.add.text(480, 480, 'Start Game', {
            fontFamily: 'Arial Black', fontSize: 50, color: '#ffffff', stroke: '#000000', strokeThickness: 6,
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        this.mainMenuButtonText.on('pointerdown', () => {
            this.scene.start('SandCity');
        }, this);
    }
}