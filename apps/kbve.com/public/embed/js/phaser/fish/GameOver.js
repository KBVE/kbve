//import { Scene } from 'phaser';

class GameOver extends Phaser.Scene {
    constructor() {
        super('GameOver');
    }

    preload(){
        this.load.image('background', '/assets/img/fishchip/bg.png');
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
        this.cameras.main.setBackgroundColor(0xff0000);
        this.add.image(480, 384, 'background').setAlpha(0.5).setTint(0xff0000);

        this.add.text(480, 100, `Game Over\nScore: ${this.score}\nWPM: ${this.wpm}`, {
            fontFamily: 'Arial Black', fontSize: 38, color: '#ffffff',
            stroke: '#000000', strokeThickness: 8,
            align: 'center'
        }).setOrigin(0.5);

        // Render the high scores
        this.add.text(480, 300, 'High Scores', {
            fontFamily: 'Arial Black', fontSize: 64, color: '#ffffff',
            stroke: '#000000', strokeThickness: 8,
            align: 'center'
        }).setOrigin(0.5);

        this.scores.forEach((score, index) => {
            this.add.text(480, 400 + (index * 50), `${index + 1}. Score: ${score.score} - WPM: ${score.wpm}`, {
                fontFamily: 'Arial Black', fontSize: 38, color: '#ffffff',
                stroke: '#000000', strokeThickness: 8,
                align: 'center'
            }).setOrigin(0.5);
        });

        const mainMenuButtonImage = this.add.image(480, 700, 'wood').setOrigin(0.5).setScale(1, 0.2).setInteractive({ useHandCursor: true });
        const mainMenuButtonText = this.add.text(480, 700, 'Go Back To Town', {
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

window.GameOver = GameOver;