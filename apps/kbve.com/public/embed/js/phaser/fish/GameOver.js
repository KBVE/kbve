class GameOver extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  preload() {
    this.load.image('background', '/assets/img/fishchip/scaled_fish_menu_minigame.webp');
  }

  init(data) {
    this.score = data.score;
    this.wpm = data.wpm;

    let scores = JSON.parse(localStorage.getItem('scores')) || [];
    scores.push({ score: this.score, wpm: this.wpm });
    scores.sort((a, b) => b.score - a.score);
    scores = scores.slice(0, 5);
    localStorage.setItem('scores', JSON.stringify(scores));

    //get and set total score
    let totalScore = JSON.parse(localStorage.getItem('totalScore')) || 0;
    totalScore += this.score;
    localStorage.setItem('totalScore', JSON.stringify(totalScore));

     // this.updateTotalScore(this.score);
  }

  create() {
    this.scores = JSON.parse(localStorage.getItem('scores')) || [];

    this.add.image(480, 480, 'background').setScale(1.4, 1.4);

    this.add.text(480, 100, `Game Over\nScore: ${this.score}\nWPM: ${this.wpm}`, {
      fontFamily: 'Arial Black', fontSize: 38, color: '#ffffff',
      stroke: '#000000', strokeThickness: 8,
      align: 'center'
    }).setOrigin(0.5);

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
      fontFamily: 'Arial Black', fontSize: 40, color: '#ffffff',
      stroke: '#000000', strokeThickness: 6,
    }).setInteractive({ useHandCursor: true });

    const mainMenuButtonText = this.add.text(500, 600, 'Go Back To Town', {
      fontFamily: 'Arial Black', fontSize: 40, color: '#ffffff',
      stroke: '#000000', strokeThickness: 6,
    }).setInteractive({ useHandCursor: true });

    retryMenuButtonText.on('pointerdown', () => {
      this.retry();
    });

    mainMenuButtonText.on('pointerdown', () => {
      this.mainMenu();
    });

    this.add.text(480, 700, 'Press Shift or R to Retry', {
      fontFamily: 'Arial Black', fontSize: 32, color: '#ffffff',
      stroke: '#000000', strokeThickness: 6,
      align: 'center'
    }).setOrigin(0.5);

    // Attach the keydown event listener only once
    this.input.keyboard.on('keydown', this.handleKeyDown, this);
  }

  handleKeyDown(event) {
    const key = event.key.toUpperCase();
    if (key === 'SHIFT' || key === 'R') {
      this.retry();
    }
  }

  retry() {
    this.scene.start('FishChipScene');
  }

  mainMenu() {
    this.scene.start('TownScene');
  }


  //** Inventory Sync */
  //** NanoStores updateInventoryAddFish */
  updateInventoryAddFish(additionalFish) {
    // Check if nanostorespersistent and totalScoreStore are initialized
      if (window.nanostorespersistent) {
          try {
              const totalScoreStore = window.nanostorespersistent.totalScoreStore;
              
              let totalScore = totalScoreStore.get();
              totalScore += additionalScore;
              totalScoreStore.set(totalScore);
          } catch (error) {
              console.error('Error updating totalScore with nanostores:', error);
              this.fallbackToUpdateLocalStorage(additionalScore);
          }
      } else {
          // Fallback directly if nanostorespersistent or totalScoreStore are not available
          console.warn('nanostorespersistent or totalScoreStore not initialized. Falling back to localStorage.');
          this.fallbackToUpdateLocalStorage(additionalScore);
      }
  }

  //** Fallback to localStorage */
  fallbackToUpdateLocalStorage(additionalScore) {
      let totalScore = JSON.parse(localStorage.getItem('totalScore')) || 0;
      totalScore += additionalScore;
      localStorage.setItem('totalScore', JSON.stringify(totalScore));
  }

  //**  */


}

window.GameOver = GameOver;
