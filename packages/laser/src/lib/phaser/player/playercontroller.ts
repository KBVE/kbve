import { Scene } from 'phaser';
import { Quadtree, type Point, type Range } from '../../quadtree';

export class PlayerController {
  private scene: Scene;
  private gridEngine: any;
  private quadtree: Quadtree;
  private cursor: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
  private wasdKeys!: { [key: string]: Phaser.Input.Keyboard.Key; };


  constructor(scene: Scene, gridEngine: any, quadtree: Quadtree) {
    this.scene = scene;
    this.gridEngine = gridEngine;
    this.quadtree = quadtree;
    this.cursor = this.scene.input.keyboard?.createCursorKeys();
    this.initializeWASDKeys();
  }

  private initializeWASDKeys() {
    const keyboard = this.scene.input.keyboard;
    if (keyboard) {
      this.wasdKeys = {
        W: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
    }
  }


  handleMovement() {
    if (!this.cursor) return;

    const cursors = this.cursor;
    const wasd = this.wasdKeys;

    if (this.scene.input.keyboard?.addKey('F').isDown) {
      const position = this.gridEngine.getPosition('player') as Point;
      const foundRanges = this.quadtree.query(position);

      for (const range of foundRanges) {
        range.action();
      }
    }

    if ((cursors.left.isDown || wasd['A'].isDown) && (cursors.up.isDown || wasd['W'].isDown)) {
      this.gridEngine.move('player', 'up-left');
    } else if ((cursors.left.isDown || wasd['A'].isDown) && (cursors.down.isDown || wasd['S'].isDown)) {
      this.gridEngine.move('player', 'down-left');
    } else if ((cursors.right.isDown || wasd['D'].isDown) && (cursors.up.isDown || wasd['W'].isDown)) {
      this.gridEngine.move('player', 'up-right');
    } else if ((cursors.right.isDown || wasd['D'].isDown) && (cursors.down.isDown || wasd['S'].isDown)) {
      this.gridEngine.move('player', 'down-right');
    } else if (cursors.left.isDown || wasd['A'].isDown) {
      this.gridEngine.move('player', 'left');
    } else if (cursors.right.isDown || wasd['D'].isDown) {
      this.gridEngine.move('player', 'right');
    } else if (cursors.up.isDown || wasd['W'].isDown) {
      this.gridEngine.move('player', 'up');
    } else if (cursors.down.isDown || wasd['S'].isDown) {
      this.gridEngine.move('player', 'down');
    }
  }
}