import { Scene } from 'phaser';

export class Preloader extends Scene {
    constructor() {
        super('Preloader');
    }

    preload() {
        this.load.image('mainBg', 'https://utfs.io/f/2c17f660-7f39-4edf-b83e-122a71014d99-6gflls.webp'); // Ensure you have a correct path to your logo image
        this.load.image('scroll', '/assets/img/fishchip/scroll.webp');
        this.load.audio('music', '/assets/img/fishchip/bg.ogg');
        this.load.image('creditsBg', 'https://cdn.discordapp.com/attachments/1213306326290010112/1213992501166350466/itchcover.png?ex=65f77d9f&is=65e5089f&hm=1118240df1bba0735961a514a40d5293e91710f95d3746a1e32f61b218d63a30&');
        this.load.audio('type', '/assets/img/fishchip/type.mp3');
        this.load.spritesheet('fishing', '/assets/img/fishchip/animate.png', { frameWidth: 800, frameHeight: 600 });
        this.load.image('fish', '/assets/img/letter_logo.png');
        this.load.image('background', '/assets/img/fishchip/scaled_fish_menu_minigame.webp');
        this.load.image('fish', '/assets/img/letter_logo.png');

        //  Cloud TileSet -> cloud_tileset.png
        this.load.image("tiles", "/assets/img/fishchip/desert_tileset_1.png");
        this.load.tilemapTiledJSON(
            "cloud-city-map",
            "/assets/img/fishchip/cloud_city.json",
        );
        // /assets/img/fishchip/characters_filter.png
        this.load.spritesheet("player", "/assets/img/fishchip/chip_charactersheet_warmer.png", {
            frameWidth: 52,
            frameHeight: 72,
        });

    }

    create() {
        if (!this.sound.get('music')?.isPlaying) {
            this.sound.add('music', { loop: true, volume: 0.1 }).play();
        }
        this.add.image(480, 480, 'mainBg').setScale(0.1);

        this.mainMenuButtonImage = this.add.image(480, 480, 'scroll').setAlpha(0.9).setScale(0.7, 0.2).setInteractive({ useHandCursor: true });

        this.mainMenuButtonText = this.add.text(480, 480, 'Start Game', {
            fontFamily: 'Arial Black', fontSize: 50, color: '#ffffff', stroke: '#000000', strokeThickness: 6,
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        this.mainMenuButtonText.on('pointerdown', () => {
            this.scene.start('TownScene');
        }, this);
    }
}