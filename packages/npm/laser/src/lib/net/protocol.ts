export const PROTOCOL_VERSION = 1;

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

export interface Welcome {
	protocol: number;
	your_slot: number;
	seed: number;
}

export type ServerEvent =
	| { Welcome: Welcome }
	| { Snapshot: Snapshot }
	| { Ephemeral: { kind: number; payload: number[] } }
	| { Reject: { reason: string } };

export const OWNER_NONE = 0xffff;

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
