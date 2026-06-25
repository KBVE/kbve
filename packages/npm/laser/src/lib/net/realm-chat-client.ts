import { GAMECHAT_KIND_CHAT, type GamechatFrame } from './gamechat-wire';
import { LaserEventBus } from '../core/events';
import {
	ReconnectingSocket,
	type ConnectionState,
	type ConnectionStatus,
} from './connection';

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
	/** Sender's own display nick (from the JWT). Local-echoed on send — the
	 * IRC gateway broadcasts to other clients but doesn't echo PRIVMSG back to
	 * the originator, so without this the player never sees their own message. */
	nick?: string;
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
		let frame: GamechatFrame;
		try {
			frame = JSON.parse(
				typeof ev.data === 'string' ? ev.data : String(ev.data),
			);
		} catch {
			return;
		}
		if (frame.kind !== GAMECHAT_KIND_CHAT) return;
		if (frame.channel && frame.channel !== this.opts.channel) return;
		this.bus.emit('message', { from: frame.sender, text: frame.content });
	}

	send(text: string): void {
		const trimmed = text.trim().slice(0, 200);
		if (!trimmed || !this.socket.isOpen()) return;
		const frame: GamechatFrame = {
			kind: GAMECHAT_KIND_CHAT,
			sender: '',
			platform: '',
			channel: this.opts.channel,
			content: trimmed,
		};
		this.socket.send(JSON.stringify(frame));
		// Local echo: the gateway broadcasts to other clients but never sends
		// the message back to its originator, so surface it locally under the
		// player's own nick. Mirrors what other clients receive for this sender.
		this.bus.emit('message', {
			from: this.opts.nick || 'you',
			text: trimmed,
		});
	}

	close(): void {
		this.socket.close();
	}
}
