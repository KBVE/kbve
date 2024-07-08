// NPCHandler.ts
import { EventEmitter } from '../../eventhandler';

import { type PlayerMoveEventData, type NPCInteractionEventData, type PlayerStealEventData } from '../../../types';

interface NPCActionHandlers {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [action: string]: (eventData: NPCInteractionEventData) => void;
}

class NPCHandler {
  private actionHandlers: NPCActionHandlers;

  constructor() {
    this.actionHandlers = {
        Talk: this.talkToNPC.bind(this),
        Trade: this.tradeWithNPC.bind(this),
        "Move to": this.moveToNPC.bind(this),
        Steal: this.stealFromNPC.bind(this),
        Combat: this.startCombat.bind(this),
        "Check Fish": this.checkFish.bind(this)  
    };
  }

  getActionHandler(action: string): (eventData: NPCInteractionEventData) => void | undefined {
    return this.actionHandlers[action];
  }

  talkToNPC(eventData: NPCInteractionEventData) {
    console.log(`Talking to NPC with ID: ${eventData.npcId}`);
    // Implement talking logic here
  }

  tradeWithNPC(eventData: NPCInteractionEventData) {
    console.log(`Trading with NPC with ID: ${eventData.npcId}`);
    // Implement trading logic here
  }

  moveToNPC(eventData: NPCInteractionEventData) {
    // Get NPC coordinates from eventData
    const coords = eventData.data?.coords || { x: 10, y: 15 };
    const playerMoveEventData: PlayerMoveEventData = coords;
    EventEmitter.emit('playerMove', playerMoveEventData);
  }

  stealFromNPC(eventData: NPCInteractionEventData) {
    console.log(`Attempting to steal from NPC with ID: ${eventData.npcId}`);
    const playerStealEventData: PlayerStealEventData = {
      npcId: eventData.npcId,
      npcName: eventData.npcName,
      data: eventData.data
    };
    EventEmitter.emit('playerSteal', playerStealEventData);

    // Implement stealing logic here
  }

  startCombat(eventData: NPCInteractionEventData) {
    console.log(`Starting combat with NPC with ID: ${eventData.npcId}`);
    // Implement combat logic here
  }

  checkFish(eventData: NPCInteractionEventData) {
    console.log(`Checking fish for NPC with ID: ${eventData.npcId}`);
    // Implement check fish logic here
  }

  
  attachNPCEvent<T>(sprite: Phaser.GameObjects.Sprite, title: string, actions: { label: string }[], data?: T) {
    sprite.setInteractive();
    sprite.on('pointerover', (pointer: { x: number; y: number; }) => {
      const npcInteractionData: NPCInteractionEventData<T> = {
        npcId: sprite.name || '',
        npcName: title,
        actions: actions.map(action => action.label),
        data: data || {} as T ,
        coords: { x: pointer.x, y: pointer.y}
      };
      EventEmitter.emit('npcInteraction', npcInteractionData);
    });

    sprite.on('pointerout', () => {
      // EventEmitter.emit('npcInteraction', null);
    });

    sprite.on('pointerdown', (pointer: { x: number; y: number; }) => {
      const npcInteractionData: NPCInteractionEventData<T> = {
        npcId: sprite.name || '',
        npcName: title,
        actions: actions.map(action => action.label),
        data: data || {} as T,
        coords: { x: pointer.x, y: pointer.y}
      };
      console.log(`Click Registered at X: ${npcInteractionData.coords.x} Y: ${npcInteractionData.coords.y}`);
      EventEmitter.emit('npcInteractionClick', npcInteractionData, 1000);
      
    });
  }
}

export const npcHandler = new NPCHandler();
