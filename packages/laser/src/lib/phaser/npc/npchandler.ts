// NPCHandler.ts
import { EventEmitter, type PlayerMoveEventData, type NPCInteractionEventData, type PlayerStealEventData} from '../../eventhandler';

interface NPCActionHandlers {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [action: string]: (npcId: string, npcName: string, data?: any) => void;
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getActionHandler(action: string): (npcId: string, npcName: string, data?: any) => void | undefined {
    return this.actionHandlers[action];
  }
  talkToNPC(npcId: string, data?: any) {
    console.log(`Talking to NPC with ID: ${npcId}`);
    // Implement talking logic here
  }

  tradeWithNPC(npcId: string, data?: any) {
    console.log(`Trading with NPC with ID: ${npcId}`);
    // Implement trading logic here
  }

  moveToNPC(npcId: string, data?: any) {
    // Get NPC coordinates based on npcId, for example purposes we use fixed coords
    const coords = data?.coords || { x: 10, y: 15 };
    const eventData: PlayerMoveEventData = coords;
    EventEmitter.emit('playerMove', eventData);
  }

  stealFromNPC(npcId: string, npcName: string, data?: any) {
    //console.log(`Attempting to steal from NPC with ID: ${npcId}`);
    const eventData: PlayerStealEventData = {
      npcId,
      npcName,
      data
    };
    EventEmitter.emit('playerSteal', eventData);

    // Implement stealing logic here
  }

  startCombat(npcId: string, data?: any) {
    console.log(`Starting combat with NPC with ID: ${npcId}`);
    // Implement combat logic here
  }

  checkFish(npcId: string, data?: any) {
    console.log(`Checking fish for NPC with ID: ${npcId}`);
    // Implement check fish logic here
  }

  attachNPCEvent<T>(sprite: Phaser.GameObjects.Sprite, title: string, actions: { label: string }[], data?: T) {
    sprite.setInteractive();
    sprite.on('pointerover', () => {
      //console.log(`Hovering over NPC: ${sprite.name}, Data: ${JSON.stringify(data)}`); // Debug log
      const npcInteractionData: NPCInteractionEventData<T> = {
        npcId: sprite.name || '',
        npcName: title,
        actions: actions.map(action => action.label),
        data: data || {} as T // Use provided data or an empty object
      };
      EventEmitter.emit('npcInteraction', npcInteractionData);
    });

    sprite.on('pointerout', () => {
      // EventEmitter.emit('npcInteraction', null);
    });
  }


}

export const npcHandler = new NPCHandler();