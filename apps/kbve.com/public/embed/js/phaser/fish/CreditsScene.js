class CreditsScene extends Phaser.Scene {
    constructor() {
        super({ key: 'CreditsScene' });
    }

    create() {
        // Background or styling for the credits scene
        this.cameras.main.setBackgroundColor('#000'); // Set a background color

        // Add text for credits
        let creditsText = "Artists:\nBChip\n\nDevelopers:\nBChip\nHolyByte";
        this.add.text(this.cameras.main.centerX, this.cameras.main.centerY, creditsText, {
            font: '20px Arial',
            fill: '#fff',
            align: 'center',
            boundsAlignH: 'center',
            boundsAlignV: 'middle',
        }).setOrigin(0.5);

        // Optionally, add a button or method to return to the main menu
        let backButton = this.add.text(50, this.cameras.main.height - 50, 'Back', {
            font: '18px Arial',
            fill: '#fff'
        }).setInteractive();

        backButton.on('pointerdown', () => {
            this.scene.start('TownScene');
        });
    }
}
