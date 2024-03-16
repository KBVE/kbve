import Phaser from "phaser"


export class NenkoPort extends Phaser.Scene {

    mainMenuButtonImage: Phaser.GameObjects.Image | undefined;
    mainMenuButtonText: Phaser.GameObjects.Text | undefined;
    
    constructor() {
        super('NenkoPort');
    }

    preload() {}

    create() {


        // Menu Music -> Replace Key from 'music' to maybe 'menumusic' ?

        //! This has to be placed back in!
        // Commenting out music for now.
        // if (!this.sound.get('music')?.isPlaying) {
        //     this.sound.add('music', { loop: true, volume: 0.1 }).play();
        // }

        // Main Menu Background
        //this.add.image(480, 480, 'mainBg').setScale(0.1);

        // Main Menu Button [START]
        this.mainMenuButtonImage = this.add.image(480, 480, 'scroll').setAlpha(0.9).setScale(0.9, 0.3).setInteractive({ useHandCursor: true });
        this.mainMenuButtonText = this.add.text(480, 480, 'Menu', {
            fontFamily: 'Arial Black', fontSize: 50, color: '#ffffff', stroke: '#000000', strokeThickness: 6,
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        this.mainMenuButtonText.on('pointerdown', () => {
            this.scene.start('Space');
        }, this);

        // Main Menu Button [END]


    }
}