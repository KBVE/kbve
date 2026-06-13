export const PROTOCOL_VERSION = 5;

export const ACTION_ATTACK = 1;
export const ACTION_PICKUP = 2;

export const EPHEMERAL_INVENTORY = 1;
export const EPHEMERAL_COMBAT = 2;
export const EPHEMERAL_PICKUP = 3;
export const EPHEMERAL_ITEM_USED = 5;
export const EPHEMERAL_EQUIPPED = 6;
export const EPHEMERAL_STATS = 7;

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
	| 'Leave';

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

export interface CombatEvent {
	attacker: number;
	target: number;
	target_ref: string | null;
	dmg: number;
	died: boolean;
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
