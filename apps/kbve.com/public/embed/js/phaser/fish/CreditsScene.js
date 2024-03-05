class CreditsScene extends Phaser.Scene {
    constructor() {
        super({ key: 'CreditsScene' });
    }

    preload() {
        // background image
        this.load.image('creditsBg', 'https://cdn.discordapp.com/attachments/1213306326290010112/1213992501166350466/itchcover.png?ex=65f77d9f&is=65e5089f&hm=1118240df1bba0735961a514a40d5293e91710f95d3746a1e32f61b218d63a30&');
    }

    create() {
        // Add the background image
        this.add.image(this.cameras.main.centerX, this.cameras.main.centerY, 'creditsBg');


        // add scroll background for text

        /*
        Developers:
        BChip
        h0lybyte
        David

        Artists:
        ArchanDroid - Sprites
        Nezt50 - Tiles
        Retornodomal - Menus
        BChip - Music & Animations
        */
        let creditsText = "Developers:\nBChip\nh0lybyte\nDavid\n\nArtists:\nArchanDroid - Sprites\nNezt50 - Tiles\nRetornodomal - Menus\nBChip - Music & Animations"
        this.add.text(this.cameras.main.centerX, this.cameras.main.centerY, creditsText, {
            font: '20px Arial',
            fill: '#fff',
            stroke: '#000000', strokeThickness: 8,
            align: 'center',
            boundsAlignH: 'center',
            boundsAlignV: 'middle',
        }).setOrigin(0.5);

        // Optionally, add a button or method to return to the main menu
        let backButton = this.add.text(this.cameras.main.centerX-40, 550, 'Back', {
            font: '32px Arial',
            stroke: '#000000', strokeThickness: 8,
            fill: '#fff',
            align: 'center',
            boundsAlignH: 'center',
            boundsAlignV: 'middle',
        }).setInteractive({ useHandCursor: true });

        backButton.on('pointerdown', () => {
            this.scene.start('TownScene');
        });
    }
}
