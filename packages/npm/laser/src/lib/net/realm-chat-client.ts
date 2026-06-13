import { LaserEventBus } from '../core/events';
import {
	ReconnectingSocket,
	type ConnectionState,
	type ConnectionStatus,
} from './connection';

/**
 * JSON wire frame for the irc-gateway `/gamechat` endpoint (bevy_chat
 * ChatMessage). The gateway pins `sender`/`platform` server-side from the
 * authenticated session, so outbound values are placeholders.
 */
interface ChatFrame {
	kind: string;
	sender: string;
	platform: string;
	channel: string;
	content: string;
	payload?: unknown;
}

export interface RealmChatMessage {
	from: string;
	text: string;
}

/** Alias of the shared connection vocabulary, kept for existing imports. */
export type RealmChatStatus = ConnectionStatus;
export type RealmChatState = ConnectionState;

export type RealmChatEventMap = {
	open: void;
	message: RealmChatMessage;
	close: void;
	error: string;
	status: RealmChatState;
};

export interface RealmChatOptions {
	/** Base gamechat URL, e.g. wss://chat.kbve.com/gamechat */
	url: string;
	jwt: string;
	/** Game key registered in the gateway GAME_PROFILES, e.g. "cryptothrone" */
	game: string;
	/** Channel the gateway routes this game to, e.g. "#cryptothrone" */
	channel: string;
}

/**
 * Realm chat over the shared irc-gateway (ergo IRC), independent of the
 * game server's WebSocket. Reconnects with backoff while the page is open.
 */
export class RealmChatClient {
	private readonly bus = new LaserEventBus<RealmChatEventMap>();
	private readonly opts: RealmChatOptions;
	private readonly socket: ReconnectingSocket;

	constructor(opts: RealmChatOptions) {
		this.opts = opts;
		this.socket = new ReconnectingSocket(
			{
				url: () => {
					const sep = this.opts.url.includes('?') ? '&' : '?';
					return `${this.opts.url}${sep}game=${encodeURIComponent(
						this.opts.game,
					)}&token=${encodeURIComponent(this.opts.jwt)}`;
				},
				shouldReconnect: () => Boolean(this.opts.jwt),
			},
			{
				onOpen: () => this.bus.emit('open', undefined),
				onMessage: (ev) => this.handleMessage(ev),
				onState: (state) => {
					this.bus.emit('status', state);
					if (state.status === 'closed')
						this.bus.emit('close', undefined);
				},
			},
		);
	}

	on<K extends keyof RealmChatEventMap>(
		event: K,
		handler: (data: RealmChatEventMap[K]) => void,
	): () => void {
		return this.bus.on(event, handler);
	}

	getState(): RealmChatState {
		return this.socket.getState();
	}

	connect(): void {
		if (!this.opts.jwt) {
			this.bus.emit('status', {
				status: 'closed',
				attempts: 0,
				reason: 'missing auth token',
			});
			return;
		}
		this.socket.connect();
	}

	private handleMessage(ev: MessageEvent): void {
		let frame: ChatFrame;
		try {
			frame = JSON.parse(
				typeof ev.data === 'string' ? ev.data : String(ev.data),
			);
		} catch {
			return;
		}
		if (frame.kind !== 'chat') return;
		if (frame.channel && frame.channel !== this.opts.channel) return;
		this.bus.emit('message', { from: frame.sender, text: frame.content });
	}

	send(text: string): void {
		const trimmed = text.trim().slice(0, 200);
		if (!trimmed || !this.socket.isOpen()) return;
		const frame: ChatFrame = {
			kind: 'chat',
			sender: '',
			platform: '',
			channel: this.opts.channel,
			content: trimmed,
		};
		this.socket.send(JSON.stringify(frame));
	}

	close(): void {
		this.socket.close();
	}
}
