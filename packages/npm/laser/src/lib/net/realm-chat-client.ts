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

export type RealmChatStatus =
	| 'connecting'
	| 'connected'
	| 'reconnecting'
	| 'closed';

export interface RealmChatState {
	status: RealmChatStatus;
	reason?: string;
	attempts: number;
	nextRetryMs?: number;
}

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
	private ws: WebSocket | null = null;
	private closed = false;
	private attempts = 0;
	private reconnectTimer = 0;
	private everOpened = false;
	private lastReason: string | undefined;
	private state: RealmChatState = { status: 'connecting', attempts: 0 };
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

	getState(): RealmChatState {
		return this.state;
	}

	private setState(next: RealmChatState): void {
		this.state = next;
		this.bus.emit('status', next);
	}

	connect(): void {
		if (this.ws || this.closed) return;
		this.everOpened = false;
		this.setState({
			status: this.attempts === 0 ? 'connecting' : 'reconnecting',
			attempts: this.attempts,
			reason: this.lastReason,
		});
		if (!this.opts.jwt) {
			this.lastReason = 'missing auth token';
			this.setState({
				status: 'closed',
				attempts: this.attempts,
				reason: this.lastReason,
			});
			return;
		}
		const sep = this.opts.url.includes('?') ? '&' : '?';
		const url = `${this.opts.url}${sep}game=${encodeURIComponent(
			this.opts.game,
		)}&token=${encodeURIComponent(this.opts.jwt)}`;
		const ws = new WebSocket(url);
		this.ws = ws;

		ws.addEventListener('open', () => {
			this.attempts = 0;
			this.everOpened = true;
			this.lastReason = undefined;
			this.bus.emit('open', undefined);
			this.setState({ status: 'connected', attempts: 0 });
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
		ws.addEventListener('close', (ev: CloseEvent) => {
			this.ws = null;
			this.lastReason = closeReason(ev.code, ev.reason, this.everOpened);
			this.bus.emit('close', undefined);
			if (this.closed) {
				this.setState({ status: 'closed', attempts: this.attempts });
				return;
			}
			this.attempts += 1;
			const delay = Math.min(1000 * 2 ** (this.attempts - 1), 15000);
			this.setState({
				status: 'reconnecting',
				attempts: this.attempts,
				reason: this.lastReason,
				nextRetryMs: delay,
			});
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
		this.setState({ status: 'closed', attempts: this.attempts });
	}
}

/**
 * Browsers never expose the rejected HTTP status of a failed WS handshake, so
 * an auth/bad-game reject and an unreachable host both surface as code 1006
 * with no opened socket. We split on `everOpened` to give the most accurate
 * hint we can from what the WebSocket API actually reveals.
 */
function closeReason(
	code: number,
	reason: string,
	everOpened: boolean,
): string {
	const trimmed = reason.trim();
	if (everOpened) {
		if (code === 1000) return 'disconnected';
		return trimmed || `server dropped connection (code ${code})`;
	}
	if (code === 1006)
		return 'cannot reach chat — server down or auth rejected';
	return trimmed || `connection refused (code ${code})`;
}
