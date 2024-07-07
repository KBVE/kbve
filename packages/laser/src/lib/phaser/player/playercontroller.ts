import { Scene } from 'phaser';
import { Quadtree, type Point, type Range } from '../../quadtree';
import { EventEmitter } from '../../eventhandler';
import { decreasePlayerHealth, notificationType, createAndAddItemToBackpack, queryItemDB, applyConsumableEffects, equipItem, getItemDetails, removeItemFromBackpack, unequipItem } from '../../localdb';
import { type IObject,  type PlayerMoveEventData, type PlayerStealEventData, type PlayerCombatDamage, PlayerRewardEvent, type ItemActionEventData, IConsumable } from '../../../types'

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


  private handleConsume(itemId: string) {
    const item = getItemDetails(itemId) as IConsumable;
    if (item && item.consumable) {
      console.log(`Consuming item: ${item.name}`);
      applyConsumableEffects(item);
      removeItemFromBackpack(item.id);
    } else {
      console.log(`Item ${itemId} is not consumable`);
    }
  }

  private handleEquip(itemId: string) {
    const item = getItemDetails(itemId) as IObject;
    if (item) {
      console.log(`Equipping item: ${item.name}`);
      // Assuming 'weapon' slot as an example, update according to your slots
      equipItem('weapon', item.id);
    }
  }

  private handleUnequip(itemId: string) {
    const item = getItemDetails(itemId) as IObject;
    if (item) {
      console.log(`Unequipping item: ${item.name}`);
      // Assuming 'weapon' slot as an example, update according to your slots
      unequipItem('weapon');
    }
  }

  private handleDiscard(itemId: string) {
    console.log(`Discarding item: ${itemId}`);
    removeItemFromBackpack(itemId);
  }

  private handleView(itemId: string) {
    const item = getItemDetails(itemId);
    if (item) {
      console.log(`Viewing item: ${item.name}`);
      // Implement view logic, e.g., show item details in UI
    }
  }
  
  private registerEventHandlers() {
    
    //? Test Case
    EventEmitter.on('itemAction', this.handleItemAction.bind(this));

    //! Broken
    EventEmitter.on('playerMove', this.handlePlayerMove.bind(this));

    //TODO Steal
    EventEmitter.on('playerSteal', this.handlePlayerSteal.bind(this));
    EventEmitter.on('playerReward', this.handlePlayerReward.bind(this));

    //* READY
    EventEmitter.on('playerDamage', this.handlePlayerCombatDamage.bind(this));
  }

  private handleItemAction(data?: ItemActionEventData )
  {
    if(data)
      {
        console.log(`Preparing Action: ${data.itemId} with ${data.action}`);
        switch (data.action) {
          case 'consume':
            this.handleConsume(data.itemId);
            break;
          case 'equip':
            this.handleEquip(data.itemId);
            break;
          case 'unequip':
            this.handleUnequip(data.itemId);
            break;
          case 'discard':
            this.handleDiscard(data.itemId);
            break;
          case 'view':
            this.handleView(data.itemId);
            break;
          default:
            console.log(`Unknown action: ${data.action}`);
        }
      }
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