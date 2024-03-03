//import { Scene } from 'phaser';

class GameOver extends Phaser.Scene {
    constructor() {
        super('GameOver');
    }

    preload(){
        this.load.image('background', 'https://utfs.io/f/6711c1c9-bdd9-4a3a-bc61-ecc74aaa96a8-8wxnl0.webp');
    }

    init(data) {
        this.score = data.score;
        this.wpm = data.wpm;

        // add scores to web storage for high score board
        let scores = JSON.parse(localStorage.getItem('scores')) || [];
        scores.push({ score: this.score, wpm: this.wpm });
        scores.sort((a, b) => b.score - a.score);
        scores = scores.slice(0, 5);
        localStorage.setItem('scores', JSON.stringify(scores));
    }

    create() {
        this.scores = JSON.parse(localStorage.getItem('scores')) || [];

        this.add.image(480, 480, 'background').setAlpha(0.5);

        this.add.text(480, 100, `Game Over\nScore: ${this.score}\nWPM: ${this.wpm}`, {
            fontFamily: 'Arial Black', fontSize: 38, color: '#ffffff',
            stroke: '#000000', strokeThickness: 8,
            align: 'center'
        }).setOrigin(0.5);

        // Render the high scores
        this.add.text(480, 225, 'High Scores', {
            fontFamily: 'Arial Black', fontSize: 64, color: '#ffffff',
            stroke: '#000000', strokeThickness: 8,
            align: 'center'
        }).setOrigin(0.5);

        this.scores.forEach((score, index) => {
            this.add.text(480, 300 + (index * 50), `${index + 1}. Score: ${score.score} - WPM: ${score.wpm}`, {
                fontFamily: 'Arial Black', fontSize: 38, color: '#ffffff',
                stroke: '#000000', strokeThickness: 8,
                align: 'center'
            }).setOrigin(0.5);
        });

        const mainMenuButtonImage = this.add.image(480, 600, 'scroll').setOrigin(0.5).setScale(1.1, 0.2).setInteractive({ useHandCursor: true });
        // Create a Graphics object and draw a rounded rectangle on it
        const graphics = this.make.graphics({ x: 0, y: 0, add: false });
        graphics.fillStyle(0xffffff, 1); // Color doesn't matter, it won't be visible
        graphics.fillRoundedRect(0, 0, mainMenuButtonImage.width * 1.1, mainMenuButtonImage.height * 0.2, 20); // Adjust the rectangle size and corner radius as needed
        graphics.generateTexture('roundedMask', mainMenuButtonImage.width * 1.1, mainMenuButtonImage.height * 0.2);
        graphics.destroy(); // Clean up the graphics object as it's no longer needed

        // Add the mask to your image
        const mask = this.make.image({
            x: mainMenuButtonImage.x,
            y: mainMenuButtonImage.y,
            key: 'roundedMask',
            add: false
        });
        mask.visible = false; // The mask itself doesn't need to be visible

        mainMenuButtonImage.mask = new Phaser.Display.Masks.BitmapMask(this, mask);
        const mainMenuButtonText = this.add.text(480, 600, 'Go Back To Town', {
            fontFamily: 'Arial Black', fontSize: 50, color: '#ffffff', stroke: '#000000', strokeThickness: 6,
        }).setOrigin(0.5);

        // Button hover effects
        mainMenuButtonImage.on('pointerover', () => {
            mainMenuButtonImage.setScale(1.2, 0.3); // Tint the button image
            mainMenuButtonText.setScale(1.1);
        });

        mainMenuButtonImage.on('pointerout', () => {
            mainMenuButtonImage.setScale(1.1, 0.2); // Tint the button image
            mainMenuButtonText.setScale(1);
        });
        mainMenuButtonImage.on('pointerdown', () => {
            this.mainMenu();
        });
    }


    mainMenu() {
        this.scene.start('TownScene');
    }
}

window.GameOver = GameOver;