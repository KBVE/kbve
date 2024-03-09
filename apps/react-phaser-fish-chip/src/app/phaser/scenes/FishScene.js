import { Scene } from 'phaser';

export class FishScene extends Scene {
    constructor() {
        super({ key: 'FishScene' });
    }

    create() {
        // Create a fish sprite at position (100, 100)
        this.fish = this.add.sprite(100, 100, 'fish');

        // Move the fish across the screen
        this.tweens.add({
            targets: this.fish,
            x: 300, // Assuming the screen width is around 800px
            duration: 2000, // Duration of 2 seconds to move across
            ease: 'Power2',
            yoyo: true, // Go back to the starting position
            repeat: -1 // Infinite repeats
        });
    }

    update() {
        // Here you could add logic that needs to be checked or updated every frame
    }
}