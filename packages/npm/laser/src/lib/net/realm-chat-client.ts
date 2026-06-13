import { LaserEventBus } from '../core/events';

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

export type RealmChatEventMap = {
	open: void;
	message: RealmChatMessage;
	close: void;
	error: string;
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
	private ws: WebSocket | null = null;
	private closed = false;
	private attempts = 0;
	private reconnectTimer = 0;
	private readonly bus = new LaserEventBus<RealmChatEventMap>();
	private readonly opts: RealmChatOptions;

	constructor(opts: RealmChatOptions) {
		this.opts = opts;
	}

	on<K extends keyof RealmChatEventMap>(
		event: K,
		handler: (data: RealmChatEventMap[K]) => void,
	): () => void {
		return this.bus.on(event, handler);
	}

	connect(): void {
		if (this.ws || this.closed) return;
		const sep = this.opts.url.includes('?') ? '&' : '?';
		const url = `${this.opts.url}${sep}game=${encodeURIComponent(
			this.opts.game,
		)}&token=${encodeURIComponent(this.opts.jwt)}`;
		const ws = new WebSocket(url);
		this.ws = ws;

		ws.addEventListener('open', () => {
			this.attempts = 0;
			this.bus.emit('open', undefined);
		});
		ws.addEventListener('message', (ev: MessageEvent) => {
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
			this.bus.emit('message', {
				from: frame.sender,
				text: frame.content,
			});
		});
		ws.addEventListener('error', () => this.bus.emit('error', 'socket'));
		ws.addEventListener('close', () => {
			this.ws = null;
			this.bus.emit('close', undefined);
			if (this.closed) return;
			this.attempts += 1;
			const delay = Math.min(1000 * 2 ** (this.attempts - 1), 15000);
			this.reconnectTimer = window.setTimeout(
				() => this.connect(),
				delay,
			);
		});
	}

	send(text: string): void {
		const trimmed = text.trim().slice(0, 200);
		if (!trimmed || !this.ws || this.ws.readyState !== WebSocket.OPEN)
			return;
		const frame: ChatFrame = {
			kind: 'chat',
			sender: '',
			platform: '',
			channel: this.opts.channel,
			content: trimmed,
		};
		this.ws.send(JSON.stringify(frame));
	}

	close(): void {
		this.closed = true;
		window.clearTimeout(this.reconnectTimer);
		this.ws?.close();
		this.ws = null;
	}
}
