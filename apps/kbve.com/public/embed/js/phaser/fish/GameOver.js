//import { Scene } from 'phaser';

class GameOver extends Phaser.Scene {
    constructor() {
        super('GameOver');
    }

    preload(){
        this.load.image('background', '/assets/img/fishchip/scaled_fish_menu_minigame.webp');
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

        this.add.image(480, 480, 'background').setScale(1.4, 1.4);

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

        const retryMenuButtonText = this.add.text(200, 600, 'Retry', {
            fontFamily: 'Arial Black', fontSize: 40, color: '#ffffff', stroke: '#000000', strokeThickness: 6,
        }).setInteractive({ useHandCursor: true });
        const mainMenuButtonText = this.add.text(500, 600, 'Go Back To Town', {
            fontFamily: 'Arial Black', fontSize: 40, color: '#ffffff', stroke: '#000000', strokeThickness: 6,
        }).setInteractive({ useHandCursor: true });
        
        
        retryMenuButtonText.on('pointerdown', () => {
            this.retry();
        });
        mainMenuButtonText.on('pointerdown', () => {
            this.mainMenu();
        });
    }

    retry() {
        this.scene.start('FishChipScene');
    }

    update() {
        this.input.keyboard.on('keydown', (event) => {
            if (event.key === 'Shift' || event.key === 'R') {
                // Your code here for when any Shift key is pressed
                console.log('Shift is pressed');
                this.retry();
            }
        });
    }

    mainMenu() {
        this.scene.start('TownScene');
    }
}

window.GameOver = GameOver;