import { Scene } from 'phaser';
import { Quadtree, type Point, type Range } from '@kbve/laser';

export class PlayerController {
  private scene: Scene;
  private gridEngine: any;
  private quadtree: Quadtree;
  private cursor: Phaser.Types.Input.Keyboard.CursorKeys | undefined;

  constructor(scene: Scene, gridEngine: any, quadtree: Quadtree) {
    this.scene = scene;
    this.gridEngine = gridEngine;
    this.quadtree = quadtree;
    this.cursor = this.scene.input.keyboard?.createCursorKeys();
  }

  handleMovement() {
    if (!this.cursor) return;

    const cursors = this.cursor;

    if (this.scene.input.keyboard?.addKey('F').isDown) {
      const position = this.gridEngine.getPosition('player') as Point;
      const foundRanges = this.quadtree.query(position);

      for (const range of foundRanges) {
        range.action();
      }
    }

    if (
      (cursors.left.isDown || this.scene.input.keyboard?.addKey('A').isDown)
    ) {
      this.gridEngine.move('player', 'left');
    } else if (
      (cursors.right.isDown || this.scene.input.keyboard?.addKey('D').isDown)
    ) {
      this.gridEngine.move('player', 'right');
    } else if (
      (cursors.up.isDown || this.scene.input.keyboard?.addKey('W').isDown)
    ) {
      this.gridEngine.move('player', 'up');
    } else if (
      (cursors.down.isDown || this.scene.input.keyboard?.addKey('S').isDown)
    ) {
      this.gridEngine.move('player', 'down');
    }
  }
}