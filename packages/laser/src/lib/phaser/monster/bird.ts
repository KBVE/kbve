//  bird.ts
//  [IMPORTS]
import { Scene } from 'phaser';
//  [CORE]

/**
 * Extracts the bird number from the character ID.
 * @param {string} charId - The character ID string.
 * @returns {number} - The bird number as a numeric value.
 */
export function getBirdNum(charId: string): number {
  return +charId[charId.length - 1];
}

/**
 * Checks if the character ID corresponds to a bird.
 * @param {string} charId - The character ID string.
 * @returns {boolean} - True if the character ID matches a bird, otherwise false.
 */
export function isBird(charId: string): boolean {
  return charId.startsWith('monster_bird_') && !charId.startsWith('monster_bird_shadow');
}


/**
 * Creates cropped sprites for a bird.
 * @param {Scene} scene - The Phaser scene.
 * @param {number} x - The x-coordinate for cropping.
 * @param {number} y - The y-coordinate for cropping.
 * @param {number} width - The width of the crop.
 * @param {number} height - The height of the crop.
 * @returns {Phaser.GameObjects.Sprite[]} - An array of cropped sprites.
 */
export function createCroppedSprites(scene: Scene, x: number, y: number, width: number, height: number): Phaser.GameObjects.Sprite[] {
  const croppedSprites = [];
  for (let i = 0; i < 10; i++) {
    const monsterBirdSprite = scene.add.sprite(0, 0, "monster_bird");
    monsterBirdSprite.setCrop(x, y, width, height);
    monsterBirdSprite.scale = 3;
    croppedSprites.push(monsterBirdSprite);
  }
  return croppedSprites;
}

/**
 * Creates bird sprites in the scene.
 * @param {Scene} scene - The Phaser scene.
 * @returns {Phaser.GameObjects.Sprite[]} - An array of bird sprites.
 */
export function createBirdSprites(scene: Scene): Phaser.GameObjects.Sprite[] {
  return createCroppedSprites(scene, 0, 0, 61, 47);
}

/**
 * Creates shadow sprites for the bird in the scene.
 * @param {Scene} scene - The Phaser scene.
 * @returns {Phaser.GameObjects.Sprite[]} - An array of shadow sprites.
 */
export function createShadowSprites(scene: Scene): Phaser.GameObjects.Sprite[] {
  return createCroppedSprites(scene, 22, 47, 16, 10);
}

/**
 * Creates the bird animation in the scene.
 * @param {Scene} scene - The Phaser scene.
 */
export function createBirdAnimation(scene: Scene) {
  scene.anims.create({
    key: "bird",
    frames: scene.anims.generateFrameNumbers("monster_bird", {
      start: 0,
      end: 2,
    }),
    frameRate: 10,
    repeat: -1,
    yoyo: true,
  });
}
