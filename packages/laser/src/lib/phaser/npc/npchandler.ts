// NPCHandler.ts
import { EventEmitter } from '../../eventhandler';

import { type PlayerMoveEventData, type NPCInteractionEventData, type PlayerStealEventData, type NPCAction} from '../../../types';

type NPCActionHandlers = Record<NPCAction, (eventData: NPCInteractionEventData) => void>;


class NPCHandler {
  private actionHandlers: NPCActionHandlers;

  constructor() {
    this.actionHandlers = {
        talk: this.talkToNPC.bind(this),
        quest: this.questWithNPC.bind(this),
        trade: this.tradeWithNPC.bind(this),
        combat: this.startCombat.bind(this),
        heal: this.healNPC.bind(this),
        steal: this.stealFromNPC.bind(this)
    } as NPCActionHandlers; // Type assertion to satisfy the mapped type constraint
  }

  getActionHandler(action: NPCAction): (eventData: NPCInteractionEventData) => void {
    return this.actionHandlers[action];
  }

  questWithNPC(eventData: NPCInteractionEventData) {
    console.log(`Starting quest with NPC with ID: ${eventData.npcId}`);
    // Implement q
    
  }
  healNPC(eventData: NPCInteractionEventData) {
    console.log(`Healing NPC with ID: ${eventData.npcId}`);
    // Implement healing logic here
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
        //coords: { x: event.clientX, y: event.clientY }
      };
      console.log(`Click Registered at X: ${npcInteractionData.coords.x} Y: ${npcInteractionData.coords.y}`);
      EventEmitter.emit('npcInteractionClick', npcInteractionData, 1000);
      
    });
  }
}

export const npcHandler = new NPCHandler();
