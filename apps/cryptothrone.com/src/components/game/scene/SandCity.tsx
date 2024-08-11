import { Scene } from 'phaser';
import Phaser from 'phaser';
import {
  Quadtree,
  type Bounds,
  type Range,
  PlayerController,
  EventEmitter,
  type CharacterEventData,
  notificationType,
  createULID,
  npcDatabase,
  mapDatabase,
} from '@kbve/laser';

declare global {
  interface Window {
    __GRID_ENGINE__?: any;
  }
}

class ExtendedSprite extends Phaser.GameObjects.Sprite {
  textBubble?: Phaser.GameObjects.Container;
  tooltip?: Phaser.GameObjects.Container;
}



export class SandCity extends Scene {


  cursor: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
  gridEngine: any;
  quadtree: Quadtree;
  playerController: PlayerController | undefined;

  constructor() {
    super({ key: 'SandCity' });
    const bounds: Bounds = { xMin: 0, xMax: 100, yMin: 0, yMax: 100 };
    this.quadtree = new Quadtree(bounds);
  }

  preload() {
    EventEmitter.emit('notification', {
      title: 'Success',
      message: `You arrived safely to SandCity Passport: ${createULID()}`,
      notificationType: notificationType.success,
    });
  }

  async create() {
    let cloudCityTilemap: Phaser.Tilemaps.Tilemap | null = null;

    try {
      cloudCityTilemap = await mapDatabase.loadMap(this, 'cloud-city-map');
    } catch (error) {
      console.error('Failed to load map:', error);
      return;
    }

    if (!cloudCityTilemap) {
      console.error('Tilemap could not be loaded.');
      return;
    }

    const playerSprite = this.add.sprite(0, 0, 'player');
    playerSprite.scale = 1.5;


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

    await npcDatabase.loadCharacter(this, '01J2DT4G871KJ0VNSHCNC5REDM', 6, 6);

    await npcDatabase.loadCharacter(this, '01J2HCTMQ58JBMJGW9YA3FBQCG', 8, 8);

    await npcDatabase.loadCharacter(this, '01J2HQJBMBGEEMWDBDWATRCY3T', 8, 15);

   

    window.__GRID_ENGINE__ = this.gridEngine;
  }

  loadRanges() {
    const ranges: Range[] = [
      {
        name: 'well',
        bounds: { xMin: 2, xMax: 5, yMin: 10, yMax: 14 },
        action: () => {
          const eventData: CharacterEventData = {
            message:
              'Seems like there are no fish in the sand pits. You know null, this area could be fixed up a bit too.',
          };
          EventEmitter.emit('charEvent', eventData);
        },
      },
      {
        name: 'sign',
        bounds: { xMin: 2, xMax: 5, yMin: 2, yMax: 5 },
        action: () => {
          const eventData = {
            message: 'Sign does not have much to say.',
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
  }
}
