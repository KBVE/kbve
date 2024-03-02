import { Scene } from 'phaser';

export class GameOver extends Scene {
    constructor() {
        super('GameOver');
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
        this.cameras.main.setBackgroundColor(0xff0000);
        // red tint
        this.add.image(480, 384, 'background').setAlpha(0.5).setTint(0xff0000);

        this.add.text(480, 384, `Game Over\nScore: ${this.score}\nWPM: ${this.wpm}`, {
            fontFamily: 'Arial Black', fontSize: 64, color: '#ffffff',
            stroke: '#000000', strokeThickness: 8,
            align: 'center'
        }).setOrigin(0.5);

        const mainMenuButtonImage = this.add.image(480, 600, 'wood').setOrigin(0.5).setScale(0.7, 0.2).setInteractive({ useHandCursor: true });
        const mainMenuButtonText = this.add.text(480, 600, 'Main Menu', {
            fontFamily: 'Arial Black', fontSize: 50, color: '#ffffff', stroke: '#000000', strokeThickness: 6,
        }).setOrigin(0.5);

        // Button hover effects
        mainMenuButtonImage.on('pointerover', () => {
            mainMenuButtonImage.setScale(.8, 0.3); // Tint the button image
            mainMenuButtonText.setScale(1.1);
        });

        mainMenuButtonImage.on('pointerout', () => {
            mainMenuButtonImage.setScale(.7, 0.2); // Tint the button image
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