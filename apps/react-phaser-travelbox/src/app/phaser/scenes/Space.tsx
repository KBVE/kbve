
import { Scene } from 'phaser';
import Phaser from 'phaser';

// import GridEngine from 'grid-engine';

// import { useStore } from '@nanostores/react';

import { score } from './data/score';

 declare global {
   interface Window {
     __GRID_ENGINE__?: any; // Use a more specific type instead of any if possible
   }
 }



class ExtendedSprite extends Phaser.GameObjects.Sprite {
  textBubble?: Phaser.GameObjects.Container; // Assuming it's a Container
}


export class Space extends Scene {

  npcSprite: ExtendedSprite | undefined;
  fishNpcSprite: ExtendedSprite| undefined;
  cursor: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
  gridEngine: any;

  constructor() {
    super({ key: 'Space' });
  }

  create() {

    const currentScore = score.get();

    const cloudCityTilemap = this.make.tilemap({ key: "space-map" });
    cloudCityTilemap.addTilesetImage("Space Map", "tiles");
    for (let i = 0; i < cloudCityTilemap.layers.length; i++) {
      const layer = cloudCityTilemap.createLayer(i, "Space Map", 0, 0);
      if (layer) {
        layer.scale = 3;
      } else {
        console.error(`Layer ${i} could not be created.`);
      }
    }
    const playerSprite = this.add.sprite(0, 0, "player");
    playerSprite.scale = 1.5;

    this.npcSprite = this.add.sprite(0, 0, "player");
    this.npcSprite.scale = 1.5;

    // this.npcSprite = this.add.sprite(0, 0, "player");
    // this.npcSprite.scale = 1.5;

    this.fishNpcSprite = this.add.sprite(0, 0, "player");
    this.fishNpcSprite.scale = 1.5;

    this.cameras.main.startFollow(playerSprite, true);
    this.cameras.main.setFollowOffset(
      -playerSprite.width,
      -playerSprite.height,
    );

    const gridEngineConfig = {
      characters: [
        {
          id: "player",
          sprite: playerSprite,
          walkingAnimationMapping: 6,
          startPosition: { x: 5, y: 12 }, //Initial position 8,8, Lamp position 14 x, 11 y
        },
        {
          id: "npc",
          sprite: this.npcSprite,
          walkingAnimationMapping: 5,
          startPosition: { x: 4, y: 10 }, //Initial position 8,8
          speed: 3,
        },
        {
          id: "fishNpc",
          sprite: this.fishNpcSprite,
          walkingAnimationMapping: 4,
          startPosition: { x: 8, y: 14 }, //Initial position 8,8
          speed: 3,
        },
      ],
    };

    this.gridEngine.create(cloudCityTilemap, gridEngineConfig);

    //const scoreStr = localStorage.getItem('totalScore');
    //const scores: ScoreEntry[] = scoreStr ? JSON.parse(scoreStr) : [];

    this.createTextBubble(this.npcSprite, "Enter the sand pit to start fishing! Go near it and press F!");
    this.createTextBubble(this.fishNpcSprite, `You have caught a total of ${currentScore.score} fish!`);
    this.gridEngine.moveRandomly("npc", 1500, 3);

    this.gridEngine.moveRandomly("fishNpc", 1500, 3);
    window.__GRID_ENGINE__ = this.gridEngine;

  }

  createTextBubble(sprite: ExtendedSprite, text: string | string[]) {
    const bubbleWidth = 200;
    const bubbleHeight = 60;
    const bubblePadding = 10;

    const bubble = this.add.graphics();
    bubble.fillStyle(0xffffff, 1);
    bubble.fillRoundedRect(0, 0, bubbleWidth, bubbleHeight, 16);
    bubble.setDepth(99);

    const content = this.add.text(100, 30, text, { fontFamily: 'Arial', fontSize: 16, color: '#000000' });
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
    if(container)
    {
    container.x = sprite.x;
    container.y = sprite.y - sprite.height - container.height / 2;
    }
  }

  update() {


    if(this.input.keyboard)
    {
    this.cursor = this.input.keyboard.createCursorKeys();

    }
    const cursors = this.cursor;

    function isWithinRangeOfWell(point: { x: number; y: number; }) {
      // Define the bounds
      const xMin = 2, xMax = 5;
      const yMin = 10, yMax = 14;

      // Check if the point is within the bounds
      return point.x >= xMin && point.x <= xMax &&
        point.y >= yMin && point.y <= yMax;
    }

    function isWithinRangeOfSign(point: { x: number; y: number; }) {
      // Define the bounds
      const xMin = 2, xMax = 5;
      const yMin = 2, yMax = 5;

      // Check if the point is within the bounds
      return point.x >= xMin && point.x <= xMax &&
        point.y >= yMin && point.y <= yMax;
    }

    function isWithinRangeOfBuilding(point: { x: number; y: number; }) {
      // Define the bounds
      const xMin = 13, xMax = 13;
      const yMin = 6, yMax = 7;

      // Check if the point is within the bounds
      return point.x >= xMin && point.x <= xMax &&
        point.y >= yMin && point.y <= yMax;
    }

    function isWithinRangeOfTombstone(point: { x: number; y: number; }) {
      //  Define the bounds
      const xMin = 7, xMax = 10
      const yMin = 9, yMax = 10
      // Check if the point is within the bounds
      return point.x >= xMin && point.x <= xMax &&
        point.y >= yMin && point.y <= yMax;
    }



    if (this.input.keyboard && this.input.keyboard.addKey('F').isDown) {
      const position = this.gridEngine.getPosition('player');

      const withinRangeOfWell = isWithinRangeOfWell(position);
      if (withinRangeOfWell) {
        this.scene.start('FishChipScene');
      }

      const withinRangeOfSign = isWithinRangeOfSign(position);
      if (withinRangeOfSign) {
        this.scene.start('CreditsScene');
      }

      const withinRangeOfBuilding = isWithinRangeOfBuilding(position);
      if (withinRangeOfBuilding) {
        this.scene.start('Asteroids');
      }

      const withinRangeOfTombstone = isWithinRangeOfTombstone(position);
      if (withinRangeOfTombstone) {
        console.log('Samson Statue!');
      }
    }
    // Incase we need W A S D -> this.input.keyboard.addKey('A').isDown)
    if ((cursors && cursors.left.isDown) || (this.input.keyboard && this.input.keyboard.addKey('A').isDown)) {
      this.gridEngine.move("player", "left");
    } else if ((cursors && cursors.right.isDown) || (this.input.keyboard && this.input.keyboard.addKey('D').isDown)) {
      this.gridEngine.move("player", "right");
    } else if ((cursors && cursors.up.isDown) ||  (this.input.keyboard && this.input.keyboard.addKey('W').isDown)) {
      this.gridEngine.move("player", "up");
    } else if ((cursors && cursors.down.isDown) || (this.input.keyboard && this.input.keyboard.addKey('S').isDown)) {
      this.gridEngine.move("player", "down");
    }

    // Update the speech bubble positions for both NPCs
    if (this.npcSprite && this.npcSprite.textBubble) {
      this.updateTextBubblePosition(this.npcSprite);
    }
    if (this.fishNpcSprite && this.fishNpcSprite.textBubble) {
      this.updateTextBubblePosition(this.fishNpcSprite);
    }
  }
}
