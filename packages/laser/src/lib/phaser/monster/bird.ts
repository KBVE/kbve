import { Scene } from 'phaser';

export function getBirdNum(charId: string) {
  return +charId[charId.length - 1];
}

export function isBird(charId: string) {
  return charId.startsWith('monster_bird_') && !charId.startsWith('monster_bird_shadow');
}

export function createCroppedSprites(scene: Scene, x: number, y: number, width: number, height: number) {
  const croppedSprites = [];
  for (let i = 0; i < 10; i++) {
    const monsterBirdSprite = scene.add.sprite(0, 0, "monster_bird");
    monsterBirdSprite.setCrop(x, y, width, height);
    monsterBirdSprite.scale = 3;
    croppedSprites.push(monsterBirdSprite);
  }
  return croppedSprites;
}

export function createBirdSprites(scene: Scene) {
  return createCroppedSprites(scene, 0, 0, 61, 47);
}

export function createShadowSprites(scene: Scene) {
  return createCroppedSprites(scene, 22, 47, 16, 10);
}

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
