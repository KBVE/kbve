export const PROTOCOL_VERSION = 10;

export const ACTION_ATTACK = 1;
export const ACTION_PICKUP = 2;

export const EPHEMERAL_INVENTORY = 1;
export const EPHEMERAL_COMBAT = 2;
export const EPHEMERAL_PICKUP = 3;
export const EPHEMERAL_ITEM_USED = 5;
export const EPHEMERAL_EQUIPPED = 6;
export const EPHEMERAL_STATS = 7;
export const EPHEMERAL_STATUS = 8;
export const EPHEMERAL_TRADE = 9;
export const EPHEMERAL_SHOP = 10;
export const EPHEMERAL_BLACKJACK = 11;

export const KIND_CAT_PLAYER = 0;
export const KIND_CAT_NPC = 1;
export const KIND_CAT_ITEM = 2;

export type Dir = 'Up' | 'Down' | 'Left' | 'Right';
export type Facing = 'Up' | 'Down' | 'Left' | 'Right';

export interface Tile {
	x: number;
	y: number;
}

export type Input =
	| { Step: { dir: Dir } }
	| { MoveTo: { tile: Tile } }
	| { Face: { facing: Facing } }
	| { Action: { id: number; target: number | null } }
	| { UseItem: { item_ref: string } }
	| { EquipItem: { item_ref: string } }
	| { Heartbeat: { client_tick: number } }
	| 'Leave'
	| { TradeOffer: { target: number; items: [string, number][] } }
	| 'TradeAccept'
	| 'TradeCancel'
	| { BuyItem: { npc: number; item_ref: string; qty: number } }
	| { SellItem: { npc: number; item_ref: string; qty: number } }
	| { JoinTable: { table_ref: string } }
	| 'LeaveTable'
	| { PlaceBet: { amount: number } }
	| { BjAction: { kind: BjActionKind } }
	| { Insure: { amount: number } };

export type BjActionKind = 'Hit' | 'Stand' | 'Double' | 'Split' | 'Surrender';

export interface JoinMatch {
	protocol: number;
	jwt: string;
	kbve_username: string;
}

export interface ClientFrame {
	client_tick: number;
	inputs: Input[];
}

export type ClientMessage = { JoinMatch: JoinMatch } | { Frame: ClientFrame };

export interface PlayerView {
	slot: number;
	kbve_username: string;
	connected: boolean;
}

export type StatusKind = 'Poison' | 'Regen' | 'Haste';

export interface StatusView {
	kind: StatusKind;
	remaining: number;
}

export interface EntityDelta {
	eid: number;
	kind: number;
	owner: number;
	tile: Tile;
	facing: Facing;
	sub: number;
	hp: number;
	max_hp: number;
	destroyed: boolean;
	effects?: StatusView[];
}

export interface Snapshot {
	tick: number;
	server_time_ms: number;
	input_ack: number;
	players: PlayerView[];
	entities: EntityDelta[];
	keyframe: boolean;
}

export interface KindEntry {
	kind: number;
	ref: string;
	cat: number;
}

export interface Welcome {
	protocol: number;
	your_slot: number;
	seed: number;
	registry: KindEntry[];
}

export interface Ephemeral {
	kind: number;
	to: number;
	payload: number[];
}

export interface InventoryItem {
	ref: string;
	count: number;
}

export interface InventorySync {
	items: InventoryItem[];
}

export interface ShopResult {
	action: 'buy' | 'sell';
	item_ref: string;
	qty: number;
	ok: boolean;
	reason: string;
	balance: number;
}

export interface CombatEvent {
	attacker: number;
	target: number;
	target_ref: string | null;
	dmg: number;
	died: boolean;
	crit?: boolean;
}

export interface PickupEvent {
	item_ref: string;
	count: number;
}

export interface ItemUsedEvent {
	item_ref: string;
	heal: number;
}

export interface EquippedEvent {
	item_ref: string | null;
	slot: 'weapon' | 'armor';
	attack: number;
	defense: number;
}

export interface StatsEvent {
	level: number;
	xp: number;
	xp_next: number;
	max_hp: number;
	attack: number;
	kills?: number;
}

export interface StatusEvent {
	kind: number;
	magnitude: number;
	remaining: number;
}

export interface BlackjackHandView {
	cards: number[];
	bet: number;
	value: number;
	soft: boolean;
	doubled: boolean;
	surrendered: boolean;
	done: boolean;
	outcome: string | null;
}

export interface BlackjackSeatView {
	slot: number;
	username: string;
	bet: number;
	insurance: number;
	/** One entry per playable hand; more than one after a split. */
	hands: BlackjackHandView[];
	/** Player is offline; the seat is held open for a reconnect. */
	disconnected?: boolean;
}

export interface BlackjackStateView {
	table_ref: string;
	phase: string;
	seats: BlackjackSeatView[];
	dealer_hand: number[];
	dealer_hidden: boolean;
	active_slot: number | null;
	/** Index of the active hand within the active seat (for split turns). */
	active_hand: number | null;
	your_balance: number;
	deadline_ms: number | null;
}

export type CardSuit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type CardRank =
	| 'A'
	| '2'
	| '3'
	| '4'
	| '5'
	| '6'
	| '7'
	| '8'
	| '9'
	| '10'
	| 'J'
	| 'Q'
	| 'K';

export interface DecodedCard {
	suit: CardSuit;
	rank: CardRank;
	points: number;
	red: boolean;
}

const CARD_SUITS: CardSuit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const CARD_RANKS: CardRank[] = [
	'A',
	'2',
	'3',
	'4',
	'5',
	'6',
	'7',
	'8',
	'9',
	'10',
	'J',
	'Q',
	'K',
];
const CARD_RANK_POINTS = [11, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10];

/** Decode a server card byte (6-bit: `suit << 4 | rank`) for rendering. */
export function decodeCard(byte: number): DecodedCard {
	const rankIndex = byte & 0b1111;
	const suitIndex = (byte >> 4) & 0b11;
	return {
		suit: CARD_SUITS[suitIndex],
		rank: CARD_RANKS[rankIndex],
		points: CARD_RANK_POINTS[rankIndex],
		red: suitIndex === 1 || suitIndex === 2,
	};
}

export type ServerEvent =
	| { Welcome: Welcome }
	| { Snapshot: Snapshot }
	| { Ephemeral: Ephemeral }
	| { Reject: { reason: string } };

export const OWNER_NONE = 0xffff;

export function decodeEphemeralPayload<T>(payload: number[]): T | null {
	try {
		return JSON.parse(
			new TextDecoder().decode(Uint8Array.from(payload)),
		) as T;
	} catch {
		return null;
	}
}

export function joinFrame(jwt: string, kbveUsername: string): ClientMessage {
	return {
		JoinMatch: {
			protocol: PROTOCOL_VERSION,
			jwt,
			kbve_username: kbveUsername,
		},
	};
}

export function inputFrame(clientTick: number, inputs: Input[]): ClientMessage {
	return { Frame: { client_tick: clientTick, inputs } };
}
