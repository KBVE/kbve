// Delete this file because it does not work.
// [DELETE]

import Phaser from 'https://cdn.jsdelivr.net/npm/phaser@3.80.1/+esm';

console.log(Phaser);

class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene'});
    }

    preload() {
        this.load.image('logo', '/assets/img/letter_logo.png');
    }

    create() {
        this.logo = this.physics.add.image(400, 300, 'logo');
        this.logo.setCollideWorldBounds(true);
        this.updateTarget();
    }

    update() {
        this.physics.moveToObject(this.logo, this.target, 200);
        const distance = Phaser.Math.Distance.Between(this.logo.x, this.logo.y, this.target.x, this.target.y);
        if (distance < 4) {
            this.logo.setPosition(this.target.x, this.target.y);
            this.updateTarget();
        }
    }

    updateTarget() {
        this.target = {
            x: Phaser.Math.Between(0, 800),
            y: Phaser.Math.Between(0, 600)
        };
    }
}

export default GameScene;
