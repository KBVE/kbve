import { Scene } from 'phaser';
import Phaser from 'phaser';
import {
  Quadtree,
  type Bounds,
  type Point,
  type Range,
  PlayerController,
} from '@kbve/laser';

import { createTextBubble, updateTextBubblePosition } from '@kbve/laser';

import {
  getBirdNum,
  isBird,
  createBirdSprites,
  createShadowSprites,
  createBirdAnimation,
} from '@kbve/laser';

import {
  EventEmitter,
  type OpenModalEventData,
  type CharacterEventData,
  type PlayerEventData,
} from '@kbve/laser';

//import { TooltipMenu } from '@kbve/laser';

import { npcHandler } from '@kbve/laser';

declare global {
  interface Window {
    __GRID_ENGINE__?: any;
  }
}

class ExtendedSprite extends Phaser.GameObjects.Sprite {
  textBubble?: Phaser.GameObjects.Container;
  tooltip?: Phaser.GameObjects.Container;

}

interface PositionChangeEvent {
  charId: string;
  exitTile: { x: number; y: number };
  enterTile: { x: number; y: number };
}

export class SandCity extends Scene {
  npcSprite: ExtendedSprite | undefined;
  fishNpcSprite: ExtendedSprite | undefined;
  monsterBirdSprites: Phaser.GameObjects.Sprite[] = [];
  monsterBirdShadows: Phaser.GameObjects.Sprite[] = [];
  cursor: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
  gridEngine: any;
  quadtree: Quadtree;
  playerController: PlayerController | undefined;

  constructor() {
    super({ key: 'SandCity' });
    const bounds: Bounds = { xMin: 0, xMax: 20, yMin: 0, yMax: 20 };
    this.quadtree = new Quadtree(bounds);
  }

  preload() {
    this.load.spritesheet('monster_bird', '/assets/monster/bird_original.png', {
      frameWidth: 61,
      frameHeight: 57,
    });

    // const __playerData: PlayerEventData = {
    //   health: '100',
    //   account: 'Guest',
    //   mana: '100',
    //   inventory: [],
    // };
    // EventEmitter.emit('playerEvent', __playerData);
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

    createBirdAnimation(this);

    this.monsterBirdSprites = createBirdSprites(this);
    this.monsterBirdShadows = createShadowSprites(this);

    this.anims.staggerPlay('bird', this.monsterBirdSprites, 100);

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
        ...this.monsterBirdSprites.map((sprite, i) => ({
          id: 'monster_bird_' + i,
          sprite,
          startPosition: { x: 7, y: 7 + i },
          speed: 5,
          collides: false,
          //charLayer: 'sky'
        })),
        ...this.monsterBirdShadows.map((sprite, i) => ({
          id: 'monster_bird_shadow_' + i,
          sprite,
          startPosition: { x: 7, y: 7 + i },
          speed: 5,
          //charLayer: 'ground',
          collides: false,
        })),
      ],
      numberOfDirections: 8,
    };

    this.gridEngine.create(cloudCityTilemap, gridEngineConfig);
    this.loadRanges();

    this.playerController = new PlayerController(
      this,
      this.gridEngine,
      this.quadtree,
    );

    createTextBubble(
      this,
      this.npcSprite,
      'Enter the sand pit to start fishing! Go near it and press F!',
    );

    // this.createTextBubble(this.fishNpcSprite, `You have caught a total of ${currentScore.score} fish!`);
    this.gridEngine.moveRandomly('npc', 1500, 3);
    this.gridEngine.moveRandomly('fishNpc', 1500, 3);

    for (let i = 0; i < 10; i++) {
      this.gridEngine.moveRandomly('monster_bird_' + i, 1000, 10);
    }

    this.gridEngine
      .positionChangeStarted()
      .subscribe(({ charId, exitTile, enterTile }: PositionChangeEvent) => {
        if (isBird(charId)) {
          this.gridEngine.moveTo('monster_bird_shadow_' + getBirdNum(charId), {
            x: enterTile.x,
            y: enterTile.y,
          });
        }
      });
    
    npcHandler.attachNPCEvent(this.npcSprite, 'FisherMan', [
        { label: 'Talk' },
        { label: 'Trade' },
        { label: 'Move to' },
        { label: 'Steal' },
        { label: 'Combat' }
      ]);

    npcHandler.attachNPCEvent(this.fishNpcSprite, 'Fish NPC Actions', [
        { label: 'Check Fish' }
      ]);

      
    // this.gridEngine.follow("player", "npc", 0, true);

    // Add tooltip menu functionality
    // TooltipMenu.attachToSprite(this, this.npcSprite, "NPC Actions", [
    //   { label: "Talk", callback: () => console.log("Talking to NPC") },
    //   { label: "Trade", callback: () => console.log("Trading with NPC") }
    // ]);
    // TooltipMenu.attachToSprite(this, this.fishNpcSprite, "Fish NPC Actions", [
    //   { label: "Check Fish", callback: () => console.log("Checking fish count") }
    // ]);

    window.__GRID_ENGINE__ = this.gridEngine;
  }

  loadRanges() {
    const ranges: Range[] = [
      {
        name: 'well',
        bounds: { xMin: 2, xMax: 5, yMin: 10, yMax: 14 },
        action: () => {
          const eventData: CharacterEventData = {
            message: 'Seems like there are no fish in the sand pits. You know null, this area could be fixed up a bit too.',
          };
          EventEmitter.emit('charEvent', eventData);
        },
      },
      {
        name: 'sign',
        bounds: { xMin: 2, xMax: 5, yMin: 2, yMax: 5 },
        action: () => {
          const eventData = {
              message:
                'Sign does not have much to say.',
              character_name: 'Evee The BarKeep',
              character_image: '/assets/npc/barkeep.webp',
              background_image: '/assets/background/woodensign.webp',
            };
            EventEmitter.emit('charEvent', eventData);
        },
      },
      {
        name: 'building',
        bounds: { xMin: 13, xMax: 13, yMin: 6, yMax: 7 },
        action: () => {
          const eventData: CharacterEventData = {
            message: 'Sorry, we are closed!',
            character_name: 'Evee The BarKeep',
            character_image: '/assets/npc/barkeep.webp',
            background_image: '/assets/background/animebar.webp',
          };
          EventEmitter.emit('charEvent', eventData);
        },
      },
      {
        name: 'tombstone',
        bounds: { xMin: 7, xMax: 10, yMin: 9, yMax: 10 },
        action: () => {
          const eventData: CharacterEventData = {
            message:
              'Samson the Great was an amazing sailer, died drinking dat drank.',
            character_name: 'Samson Statue',
            character_image: '/assets/npc/samson.png',
            background_image: '/assets/background/animetombstone.webp',
          };
          EventEmitter.emit('charEvent', eventData);
        },
      },
    ];

    for (const range of ranges) {
      this.quadtree.insert(range);
    }
  }

  update() {
    this.playerController?.handleMovement();

    if (this.npcSprite && this.npcSprite.textBubble) {
      updateTextBubblePosition(this.npcSprite);
    }
    if (this.fishNpcSprite && this.fishNpcSprite.textBubble) {
      updateTextBubblePosition(this.fishNpcSprite);
    }
    // TooltipMenu.updateAllTooltipPositions(this);
  }
}
