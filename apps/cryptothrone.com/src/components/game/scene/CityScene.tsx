import { Scene } from 'phaser';
import Phaser from 'phaser';
import { Quadtree, type Bounds, type Point, type Range } from '@kbve/laser';
import { PlayerController } from '../PlayerController';

// import GridEngine from 'grid-engine';
// import { useStore } from '@nanostores/react';

declare global {
  interface Window {
    __GRID_ENGINE__?: any;
  }
}

// interface ScoreEntry {
//   wpm: number;
//   score: number;
// }

class ExtendedSprite extends Phaser.GameObjects.Sprite {
  textBubble?: Phaser.GameObjects.Container;
}

export class CityScene extends Scene {
  npcSprite: ExtendedSprite | undefined;
  fishNpcSprite: ExtendedSprite | undefined;
  cursor: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
  gridEngine: any;
  quadtree: Quadtree;
  playerController: PlayerController | undefined;

  constructor() {
    super({ key: 'CityScene' });
    const bounds: Bounds = { xMin: 0, xMax: 20, yMin: 0, yMax: 20 };
    this.quadtree = new Quadtree(bounds);
  }

  create() {
    const cloudCityTilemap = this.make.tilemap({ key: 'cloud-city-map' });
    cloudCityTilemap.addTilesetImage('Cloud City', 'tiles');
    for (let i = 0; i < cloudCityTilemap.layers.length; i++) {
      const layer = cloudCityTilemap.createLayer(i, 'Cloud City', 0, 0);
      if (layer) {
        layer.scale = 3;
      } else {
        console.error(`Layer ${i} could not be created.`);
      }
    }
    const playerSprite = this.add.sprite(0, 0, 'player');
    playerSprite.scale = 1.5;

    this.npcSprite = this.add.sprite(0, 0, 'player');
    this.npcSprite.scale = 1.5;

    this.fishNpcSprite = this.add.sprite(0, 0, 'player');
    this.fishNpcSprite.scale = 1.5;

    this.cameras.main.startFollow(playerSprite, true);
    this.cameras.main.setFollowOffset(
      -playerSprite.width,
      -playerSprite.height,
    );

    const gridEngineConfig = {
      characters: [
        {
          id: 'player',
          sprite: playerSprite,
          walkingAnimationMapping: 6,
          startPosition: { x: 5, y: 12 },
        },
        {
          id: 'npc',
          sprite: this.npcSprite,
          walkingAnimationMapping: 5,
          startPosition: { x: 4, y: 10 },
          speed: 3,
        },
        {
          id: 'fishNpc',
          sprite: this.fishNpcSprite,
          walkingAnimationMapping: 4,
          startPosition: { x: 8, y: 14 },
          speed: 3,
        },
      ],
    };

    this.gridEngine.create(cloudCityTilemap, gridEngineConfig);
    this.loadRanges();

    this.playerController = new PlayerController(
      this,
      this.gridEngine,
      this.quadtree,
    );

    this.createTextBubble(
      this.npcSprite,
      'Enter the sand pit to start fishing! Go near it and press F!',
    );

    // this.createTextBubble(this.fishNpcSprite, `You have caught a total of ${currentScore.score} fish!`);
    this.gridEngine.moveRandomly('npc', 1500, 3);

    this.gridEngine.moveRandomly('fishNpc', 1500, 3);
    window.__GRID_ENGINE__ = this.gridEngine;
  }

  loadRanges() {
    const ranges: Range[] = [
      {
        name: 'well',
        bounds: { xMin: 2, xMax: 5, yMin: 10, yMax: 14 },
        action: () => this.scene.start('FishChipScene'),
      },
      {
        name: 'sign',
        bounds: { xMin: 2, xMax: 5, yMin: 2, yMax: 5 },
        action: () => this.scene.start('CreditsScene'),
      },
      {
        name: 'building',
        bounds: { xMin: 13, xMax: 13, yMin: 6, yMax: 7 },
        action: () => console.log('Enter the Building?'),
      },
      {
        name: 'tombstone',
        bounds: { xMin: 7, xMax: 10, yMin: 9, yMax: 10 },
        action: () => console.log('Samson Statue!'),
      },
    ];

    for (const range of ranges) {
      this.quadtree.insert(range);
    }
  }

  createTextBubble(sprite: ExtendedSprite, text: string | string[]) {
    const bubbleWidth = 200;
    const bubbleHeight = 60;
    const bubblePadding = 10;

    const bubble = this.add.graphics();
    bubble.fillStyle(0xffffff, 1);
    bubble.fillRoundedRect(0, 0, bubbleWidth, bubbleHeight, 16);
    bubble.setDepth(99);

    const content = this.add.text(100, 30, text, {
      fontFamily: 'Arial',
      fontSize: 16,
      color: '#000000',
    });
    content.setOrigin(0.5);
    content.setWordWrapWidth(bubbleWidth - bubblePadding * 2);
    content.setDepth(100);

    const container = this.add.container(0, 0, [bubble, content]);
    container.setDepth(100);

    sprite.textBubble = container;
    this.updateTextBubblePosition(sprite);
  }

  updateTextBubblePosition(sprite: ExtendedSprite) {
    const container = sprite.textBubble;
    if (container) {
      container.x = sprite.x;
      container.y = sprite.y - sprite.height - container.height / 2;
    }
  }
  update() {
    this.playerController?.handleMovement();

    if (this.npcSprite && this.npcSprite.textBubble) {
      this.updateTextBubblePosition(this.npcSprite);
    }
    if (this.fishNpcSprite && this.fishNpcSprite.textBubble) {
      this.updateTextBubblePosition(this.fishNpcSprite);
    }
  }
}
