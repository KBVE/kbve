// Delete this file because it does not work.
// [DELETE]

import Phaser from 'https://cdn.jsdelivr.net/npm/phaser@3.80.1/+esm';

console.log(Phaser);

class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene'});
    }

    preload() {
        this.load.image('mainBg', 'https://utfs.io/f/2c17f660-7f39-4edf-b83e-122a71014d99-6gflls.webp');
    }

    create() {
        
        this.bg = this.add.image(400, 300, 'mainBg');

    }



}

export default GameScene;
