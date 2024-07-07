import { Scene } from 'phaser';
import { Quadtree, type Point, type Range } from '../../quadtree';
import { EventEmitter, type PlayerMoveEventData, type PlayerStealEventData, type PlayerCombatDamage, PlayerRewardEvent } from '../../eventhandler';
import { decreasePlayerHealth, notificationType, createAndAddItemToBackpack, queryItemDB } from '../../localdb';
import { type IObject } from '../../../types'

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
    this.registerEventHandlers();
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

  private registerEventHandlers() {
    
    //! Broken
    EventEmitter.on('playerMove', this.handlePlayerMove.bind(this));

    //TODO Steal
    EventEmitter.on('playerSteal', this.handlePlayerSteal.bind(this));
    EventEmitter.on('playerReward', this.handlePlayerReward.bind(this));

    //* READY
    EventEmitter.on('playerDamage', this.handlePlayerCombatDamage.bind(this));
  }

  private handlePlayerReward(data?: PlayerRewardEvent) {
    console.log(`Rewarding the player`);
    if(data) 
    {
      EventEmitter.emit('notification', {
        title: 'Success',
        message: data.message,
        notificationType: notificationType['success'],
      });
       
      createAndAddItemToBackpack(data.item);
    }
  }

  private handlePlayerCombatDamage(data?: PlayerCombatDamage )
  {
    if(data) {
      decreasePlayerHealth(parseInt(data.damage));
      EventEmitter.emit('notification', {
        title: 'Danger',
        message: `You taken ${data.damage} points of damage!`,
        notificationType: notificationType['danger'],
      });
    }
  }
  
  private handlePlayerSteal(data?: PlayerStealEventData)
  {
    if(data) {
      if (Math.random() > 0.5) {

        const item = queryItemDB('Salmon')

        if (item) {
          EventEmitter.emit('playerReward', {
            message: `You stole a ${item.name}!`,
            item: item,
          });
        } else {
          console.warn('Item not found in ItemDB');
        }
      }
      else
      {
           // console.log('Performing the Action to Steal');
        // Fail for now.
        EventEmitter.emit('notification', {
          title: 'Danger',
          message: `You failed to steal from ${data.npcName}!`,
          notificationType: notificationType['danger'],
        });
        EventEmitter.emit('playerDamage', {
          damage: '1'
        });
      }
    }
  }

  private handlePlayerMove(data?: PlayerMoveEventData) {
    if (data) {
    this.gridEngine.moveTo('player', { x: data.x, y: data.y });
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