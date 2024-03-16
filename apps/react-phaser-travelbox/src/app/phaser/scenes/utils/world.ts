import Phaser from "phaser"

const NUMBER_OF_STARS = 500;

export function createStars(scene: Phaser.Scene, width: number, height: number) {
  for (let i = 0; i < NUMBER_OF_STARS; i++) {
    const x = Phaser.Math.Between(0, width);
    const y = Phaser.Math.Between(0, height);
    const starSize = Phaser.Math.Between(1, 2); // Small variation in star size for a bit of variety
    scene.add.rectangle(x, y, starSize, starSize, 0xffffff);
  }
}
