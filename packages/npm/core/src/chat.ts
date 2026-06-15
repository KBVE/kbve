import { Store } from './store';
import type { Core, UpdateResult } from './store';

export type ChatKind =
	| 'chat'
	| 'system'
	| 'kill'
	| 'rare_drop'
	| 'capture'
	| 'quest_complete'
	| 'area_unlocked'
	| 'death'
	| 'craft'
	| 'custom';

export interface ChatMessage {
	kind: ChatKind;
	sender: string;
	platform: string;
	channel: string;
	content: string;
	payload?: unknown;
}

export interface ChatEntry {
	id: string;
	message: ChatMessage;
}

export type ChatConnection = 'offline' | 'connecting' | 'online';

export interface ChatConfig {
	game: string;
	channel: string;
	platform: string;
	nick: string;
}

export interface ChatState {
	connection: ChatConnection;
	channel: string;
	platform: string;
	nick: string;
	entries: ChatEntry[];
	error: string | null;
	seq: number;
}

export const initialChatState: ChatState = {
	connection: 'offline',
	channel: '#general',
	platform: 'mobile',
	nick: '',
	entries: [],
	error: null,
	seq: 0,
};

const MAX_ENTRIES = 200;
export const MAX_CHAT_LENGTH = 500;

export type ChatEvent =
	| { type: 'connect'; config: ChatConfig }
	| { type: 'connected' }
	| { type: 'disconnected' }
	| { type: 'connect_error'; message: string }
	| { type: 'send'; content: string }
	| { type: 'inbound'; message: ChatMessage }
	| { type: 'close' };

export type ChatEffect =
	| { type: 'chat.connect'; config: ChatConfig }
	| { type: 'chat.send'; message: ChatMessage }
	| { type: 'chat.close' };

export interface ChatViewModel {
	connection: ChatConnection;
	online: boolean;
	canSend: boolean;
	channel: string;
	entries: ChatEntry[];
	error: string | null;
}

function reduce(
	state: ChatState,
	event: ChatEvent,
): UpdateResult<ChatState, ChatEffect> {
	switch (event.type) {
		case 'connect':
			return {
				state: {
					...state,
					connection: 'connecting',
					channel: event.config.channel,
					platform: event.config.platform,
					nick: event.config.nick,
					entries: [],
					error: null,
				},
				effects: [{ type: 'chat.connect', config: event.config }],
			};
		case 'connected':
			return { state: { ...state, connection: 'online' }, effects: [] };
		case 'disconnected':
			return { state: { ...state, connection: 'offline' }, effects: [] };
		case 'connect_error':
			return {
				state: {
					...state,
					connection: 'offline',
					error: event.message,
				},
				effects: [],
			};
		case 'send': {
			if (
				state.connection !== 'online' ||
				event.content.length === 0 ||
				event.content.length > MAX_CHAT_LENGTH
			) {
				return { state, effects: [] };
			}
			const sent: ChatMessage = {
				kind: 'chat',
				sender: '',
				platform: state.platform,
				channel: state.channel,
				content: event.content,
			};
			const echo: ChatEntry = {
				id: `m${state.seq}`,
				message: { ...sent, sender: state.nick || 'me' },
			};
			return {
				state: {
					...state,
					entries: [...state.entries, echo].slice(-MAX_ENTRIES),
				},
				effects: [{ type: 'chat.send', message: sent }],
			};
		}
		case 'inbound': {
			const entry: ChatEntry = {
				id: `m${state.seq}`,
				message: event.message,
			};
			const entries = [...state.entries, entry].slice(-MAX_ENTRIES);
			return { state: { ...state, entries }, effects: [] };
		}
		case 'close':
			return {
				state: { ...state, connection: 'offline' },
				effects: [{ type: 'chat.close' }],
			};
		default:
			return { state, effects: [] };
	}
}

function project(state: ChatState): ChatViewModel {
	return {
		connection: state.connection,
		online: state.connection === 'online',
		canSend: state.connection === 'online',
		channel: state.channel,
		entries: state.entries,
		error: state.error,
	};
}

export type ChatCore = Core<ChatState, ChatEvent, ChatViewModel, ChatEffect>;

export const chatCore: ChatCore = {
	initial: () => ({ ...initialChatState, entries: [] }),
	update: (state, event) => {
		const result = reduce(state, event);
		return {
			state: { ...result.state, seq: result.state.seq + 1 },
			effects: result.effects,
		};
	},
	view: project,
};

export class ChatStore extends Store<
	ChatState,
	ChatEvent,
	ChatViewModel,
	ChatEffect
> {}
