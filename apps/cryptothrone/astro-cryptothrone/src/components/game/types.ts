export interface PlayerStats {
	hp: number;
	maxHp: number;
	level?: number;
	xp?: number;
	xpNext?: number;
	attack?: number;
	kills?: number;
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

export type ItemRarity =
	| 'common'
	| 'uncommon'
	| 'rare'
	| 'epic'
	| 'legendary'
	| 'mythic';

export interface ItemData {
	id: string;
	name: string;
	type: 'weapon' | 'armor' | 'consumable' | 'material' | 'quest';
	img: string;
	/** Sprite-atlas slot (== itemdb `key`); frame index into itemdb-atlas.png. */
	key: number;
	description: string;
	bonuses: Record<string, number>;
	durability: number;
	weight: number;
	actions: ItemAction[];
	rarity: ItemRarity;
	lore?: string;
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

// --- npcdb (typed view of @kbve/npcdb-data) ---------------------------------
// Game-facing, normalized projection of an npcdb entry. The raw JSON ships
// snake-free camelCase fields with prefixed enums (NPC_RARITY_*, MOVEMENT_TYPE_*);
// `npcdb.ts` strips the prefixes into these tidy unions for gameplay use.

export type NpcRarity = ItemRarity;

export type NpcFamily =
	| 'humanoid'
	| 'undead'
	| 'beast'
	| 'construct'
	| 'elemental'
	| 'demon'
	| 'plant'
	| 'aberration'
	| 'spirit'
	| 'unknown';

export type NpcMovement =
	| 'stationary'
	| 'random_wander'
	| 'patrol'
	| 'scripted'
	| 'aggressive';

export interface NpcStats {
	hp: number;
	maxHp: number;
	attack: number;
	defense: number;
	speed: number;
	armor: number;
}

export interface NpcAbility {
	id: string;
	name: string;
	damage: number;
}

export interface NpcEntry {
	ref: string;
	id: string;
	name: string;
	description: string;
	family: NpcFamily;
	rarity: NpcRarity;
	rank: string;
	level: number;
	movement: NpcMovement;
	firstStrike: boolean;
	stats: NpcStats;
	abilities: NpcAbility[];
	factionId: string;
	hostile: boolean;
}

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
