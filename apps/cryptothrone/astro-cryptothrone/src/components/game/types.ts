export interface PlayerStats {
	hp: number;
	maxHp: number;
	mp: number;
	maxMp: number;
	ep: number;
	maxEp: number;
	username: string;
}

export type EquipmentSlot =
	| 'head'
	| 'chest'
	| 'legs'
	| 'feet'
	| 'mainHand'
	| 'offHand'
	| 'ring'
	| 'amulet';

export interface PlayerInventory {
	backpack: string[];
	equipment: Record<EquipmentSlot, string | null>;
}

export interface ItemData {
	id: string;
	name: string;
	type: 'weapon' | 'armor' | 'consumable' | 'material' | 'quest';
	img: string;
	description: string;
	bonuses: Record<string, number>;
	durability: number;
	weight: number;
	actions: ItemAction[];
}

export type ItemAction = 'use' | 'equip' | 'drop' | 'inspect';

export interface NPCData {
	id: string;
	name: string;
	avatar: string;
	slug: string;
	actions: NPCAction[];
}

export type NPCAction = 'talk' | 'trade' | 'steal' | 'inspect';

export interface DialogueNode {
	id: string;
	title: string;
	message: string;
	playerResponse?: string;
	backgroundImage?: string;
	options?: DialogueOption[];
}

export interface DialogueOption {
	id: string;
	title: string;
	nextDialogueId: string;
}

export interface NotificationItem {
	id: number;
	title: string;
	message: string;
	type: 'info' | 'success' | 'danger' | 'warning';
	timestamp: number;
}

export interface NPCInteractionState {
	npcId: string;
	npcName: string;
	actions: NPCAction[];
	coords: { x: number; y: number };
}

export interface DialogueState {
	npcId: string;
	npcName: string;
	npcAvatar: string;
	dialogue: DialogueNode;
}

export interface DiceRollState {
	npcId: string;
	npcName: string;
	diceCount: number;
	diceValues: number[];
	totalRoll: number | null;
	phase: 'rolling' | 'result';
}

export interface ModalState {
	message: string;
	characterName?: string;
	characterImage?: string;
	backgroundImage?: string;
}
