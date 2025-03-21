import { eventEmitterInstance as EventEmitter } from '../../eventhandler';
import {
	type PlayerMoveEventData,
	type NPCInteractionEventData,
	type PlayerStealEventData,
	type NPCAction,
} from '../../../types';
import { npcDatabase } from './npcdatabase';
import { Debug } from '../../utils/debug';
// import Phaser from 'phaser';

type NPCActionHandlers = Record<
	NPCAction,
	(eventData: NPCInteractionEventData) => void
>;

class NPCHandler {
	private actionHandlers: NPCActionHandlers;

	constructor() {
		this.actionHandlers = {
			talk: this.talkToNPC.bind(this),
			quest: this.questWithNPC.bind(this),
			trade: this.tradeWithNPC.bind(this),
			combat: this.startCombat.bind(this),
			heal: this.healNPC.bind(this),
			steal: this.stealFromNPC.bind(this),
			lore: this.loreFromNPC.bind(this),
			// oath: this.oathFromNPC.bind(this)
		} as NPCActionHandlers; // Type assertion to satisfy the mapped type constraint
	}

	getActionHandler(
		action: NPCAction,
	): (eventData: NPCInteractionEventData) => void {
		return this.actionHandlers[action];
	}

	loreFromNPC(eventData: NPCInteractionEventData) {
		Debug.log(`Pulling up the lore of the NPC with ID: ${eventData.npcId}`);
	}

	questWithNPC(eventData: NPCInteractionEventData) {
		Debug.log(`Starting quest with NPC with ID: ${eventData.npcId}`);
		// Implement quest from NPC ID -> Dialogue System.
	}
	healNPC(eventData: NPCInteractionEventData) {
		Debug.log(`Healing NPC with ID: ${eventData.npcId}`);
		// Implement healing logic here. -> Test case with Jesus.
	}

	oathFromNPC(eventData: NPCInteractionEventData) {
		Debug.log(`Oath from NPC with ID: ${eventData.npcId}`);
		// TODO: Implement oath.
	}

	async talkToNPC(eventData: NPCInteractionEventData) {
		try {
			Debug.log(`Talking to NPC with ID: ${eventData.npcId}`);
			const prioritizedDialogues =
				await npcDatabase.getPrioritizedDialoguesForNPC(
					eventData.npcId,
				);
			Debug.log(prioritizedDialogues);

			// Implement further dialogue handling logic here, e.g., display the first dialogue in the list
			if (prioritizedDialogues.length > 0) {
				const dialogueToDisplay = prioritizedDialogues[0];
				// Display the dialogueToDisplay
				EventEmitter.emit(
					'npcDialogue',
					{ npcId: eventData.npcId, dialogue: dialogueToDisplay },
					1000,
				);
			} else {
				Debug.log('No dialogues available for this NPC.');
			}
		} catch (error) {
			Debug.error(
				`Failed to fetch dialogues for NPC with ID ${eventData.npcId}:`,
				error,
			);
		}
	}

	tradeWithNPC(eventData: NPCInteractionEventData) {
		Debug.log(`Trading with NPC with ID: ${eventData.npcId}`);
		// Implement trading logic here
	}

	moveToNPC(eventData: NPCInteractionEventData) {
		// Get NPC coordinates from eventData
		const coords = eventData.data?.coords || { x: 10, y: 15 };
		const playerMoveEventData: PlayerMoveEventData = coords;
		EventEmitter.emit('playerMove', playerMoveEventData);
	}

	stealFromNPC(eventData: NPCInteractionEventData) {
		Debug.log(`Attempting to steal from NPC with ID: ${eventData.npcId}`);
		const playerStealEventData: PlayerStealEventData = {
			npcId: eventData.npcId,
			npcName: eventData.npcName,
			data: eventData.data,
		};

		EventEmitter.emit('playerSteal', playerStealEventData);

		// Implement stealing logic here
	}

	startCombat(eventData: NPCInteractionEventData) {
		Debug.log(`Starting combat with NPC with ID: ${eventData.npcId}`);
		// Implement combat logic here
	}

	checkFish(eventData: NPCInteractionEventData) {
		Debug.log(`Checking fish for NPC with ID: ${eventData.npcId}`);
		// Implement check fish logic here
	}

	attachNPCEvent<T>(
		sprite: Phaser.GameObjects.Sprite,
		title: string,
		actions: { label: string }[],
		data?: T,
	) {
		sprite.setInteractive();
		sprite.on('pointerover', (pointer: { x: number; y: number }) => {
			const npcInteractionData: NPCInteractionEventData<T> = {
				npcId: sprite.name || '',
				npcName: title,
				actions: actions.map((action) => action.label),
				data: data || ({} as T),
				coords: { x: pointer.x, y: pointer.y },
			};
			EventEmitter.emit('npcInteraction', npcInteractionData);
			//Debug.log(`Mouse over the character`);
			sprite.setTint(0x00ff00);
		});

		sprite.on('pointerout', () => {
			sprite.clearTint();
			// EventEmitter.emit('npcInteraction', null);
		});

		sprite.on('pointerdown', (pointer: { x: number; y: number }) => {
			const npcInteractionData: NPCInteractionEventData<T> = {
				npcId: sprite.name || '',
				npcName: title,
				actions: actions.map((action) => action.label),
				data: data || ({} as T),
				coords: { x: pointer.x, y: pointer.y },
				//coords: { x: event.clientX, y: event.clientY }
			};
			Debug.log(
				`Click Registered at X: ${npcInteractionData.coords.x} Y: ${npcInteractionData.coords.y}`,
			);
			EventEmitter.emit('npcInteractionClick', npcInteractionData, 1000);
			// sprite.setTint(0x00ff00);
		});
	}
}

export { NPCHandler };

export const npcHandler = new NPCHandler();
