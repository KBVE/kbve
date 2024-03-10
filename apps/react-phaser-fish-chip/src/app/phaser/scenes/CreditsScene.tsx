import { Scene } from 'phaser';


export class CreditsScene extends Scene {
    constructor() {
        super({ key: 'CreditsScene' });
    }

    create() {
        // Add the background image
        this.add.image(this.cameras.main.centerX, this.cameras.main.centerY, 'creditsBg');

        // Define the credits text
        const creditsText = "Developers:\nBChip\nh0lybyte\nDavid\n\nArtists:\nArchanDroid - Sprites\nNezt50 - Tiles\nRetornodomal - Menus\nBChip - Music & Animations";

        // Add the credits text to the scene, centered
        this.add.text(this.cameras.main.centerX, this.cameras.main.centerY, creditsText, {
            font: '20px Arial',
            stroke: '#000000',
            strokeThickness: 8,
            align: 'center', // This aligns the text inside its bounding box, not the box itself
        }).setOrigin(0.5); // This centers the text box at the specified coordinates

        // Optionally, add a button to return to the main menu
        const backButton = this.add.text(this.cameras.main.centerX - 40, 550, 'Back', {
            font: '32px Arial',
            stroke: '#000000',
            strokeThickness: 8,
            align: 'center',
        }).setInteractive({ useHandCursor: true });

        backButton.on('pointerdown', () => {
            this.scene.start('TownScene');
        });
    
    }
}
