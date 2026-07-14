/**
 * Shared reconnecting WebSocket + connection state machine. Both the simgrid
 * GameClient and the RealmChatClient build on this so reconnect/backoff and
 * status reporting live in exactly one place.
 */

export type ConnectionStatus =
	| 'connecting'
	| 'connected'
	| 'reconnecting'
	| 'closed';

export interface ConnectionState {
	status: ConnectionStatus;
	/** Human-readable reason, set on drops/rejections. */
	reason?: string;
	/** Reconnect attempts made since the last clean open. */
	attempts: number;
	/** Delay until the next reconnect, when status is `reconnecting`. */
	nextRetryMs?: number;
}

export interface ReconnectingSocketOptions {
	/** URL string, or a factory invoked per attempt to refresh tokens/query. */
	url: string | (() => string);
	/** Max reconnect attempts before going terminal. 0 = retry forever. */
	maxAttempts?: number;
	baseDelayMs?: number;
	maxDelayMs?: number;
	/** Derive a human reason from the close event. */
	closeReason?: (code: number, reason: string, everOpened: boolean) => string;
	/** Return false to stop reconnecting (e.g. a terminal server rejection). */
	shouldReconnect?: () => boolean;
}

export interface ReconnectingSocketHandlers {
	onOpen?: (ws: WebSocket) => void;
	onMessage?: (ev: MessageEvent) => void;
	onState?: (state: ConnectionState) => void;
}

const DEFAULT_BASE_DELAY = 1000;
const DEFAULT_MAX_DELAY = 15000;

/**
 * Browsers never expose the rejected HTTP status of a failed WS handshake, so
 * an auth/bad-request reject and an unreachable host both surface as code 1006
 * with no opened socket. Split on `everOpened` for the best hint available.
 */
export function defaultCloseReason(
	code: number,
	reason: string,
	everOpened: boolean,
): string {
	const trimmed = reason.trim();
	if (everOpened) {
		if (code === 1000) return 'disconnected';
		return trimmed || `server dropped connection (code ${code})`;
	}
	if (code === 1006) return 'cannot reach server — down or rejected';
	return trimmed || `connection refused (code ${code})`;
}

export class ReconnectingSocket {
	private ws: WebSocket | null = null;
	private closed = false;
	private attempts = 0;
	private everOpened = false;
	private timer = 0;
	private state: ConnectionState = { status: 'connecting', attempts: 0 };
	private readonly opts: Required<
		Omit<ReconnectingSocketOptions, 'url' | 'shouldReconnect'>
	> &
		Pick<ReconnectingSocketOptions, 'url' | 'shouldReconnect'>;
	private readonly handlers: ReconnectingSocketHandlers;

	constructor(
		opts: ReconnectingSocketOptions,
		handlers: ReconnectingSocketHandlers,
	) {
		this.opts = {
			maxAttempts: 0,
			baseDelayMs: DEFAULT_BASE_DELAY,
			maxDelayMs: DEFAULT_MAX_DELAY,
			closeReason: defaultCloseReason,
			...opts,
		};
		this.handlers = handlers;
	}

	getState(): ConnectionState {
		return this.state;
	}

	isOpen(): boolean {
		return this.ws?.readyState === WebSocket.OPEN;
	}

	send(data: string | ArrayBufferView | ArrayBuffer): void {
		if (this.isOpen()) this.ws!.send(data as string);
	}

	connect(): void {
		if (this.ws) return;
		// An explicit connect() is an intent to (re)open — clear a prior deliberate
		// close() so a reconnect after a clean shutdown actually reconnects.
		this.closed = false;
		this.everOpened = false;
		this.setState({
			status: this.attempts === 0 ? 'connecting' : 'reconnecting',
			attempts: this.attempts,
			reason: this.state.reason,
		});

		const url =
			typeof this.opts.url === 'function'
				? this.opts.url()
				: this.opts.url;
		const ws = new WebSocket(url);
		// Binary frames (postcard) arrive as ArrayBuffer rather than Blob, so the
		// message handler can decode them synchronously.
		ws.binaryType = 'arraybuffer';
		this.ws = ws;

		ws.addEventListener('open', () => {
			this.attempts = 0;
			this.everOpened = true;
			this.setState({ status: 'connected', attempts: 0 });
			this.handlers.onOpen?.(ws);
		});
		ws.addEventListener('message', (ev: MessageEvent) =>
			this.handlers.onMessage?.(ev),
		);
		ws.addEventListener('close', (ev: CloseEvent) => {
			this.ws = null;
			const reason = this.opts.closeReason!(
				ev.code,
				ev.reason,
				this.everOpened,
			);
			if (this.closed) {
				this.setState({ status: 'closed', attempts: this.attempts });
				return;
			}
			if (this.opts.shouldReconnect && !this.opts.shouldReconnect()) {
				this.setState({
					status: 'closed',
					attempts: this.attempts,
					reason,
				});
				return;
			}
			this.attempts += 1;
			if (
				this.opts.maxAttempts > 0 &&
				this.attempts > this.opts.maxAttempts
			) {
				this.setState({
					status: 'closed',
					attempts: this.attempts,
					reason,
				});
				return;
			}
			const delay = Math.min(
				this.opts.baseDelayMs * 2 ** (this.attempts - 1),
				this.opts.maxDelayMs,
			);
			this.setState({
				status: 'reconnecting',
				attempts: this.attempts,
				reason,
				nextRetryMs: delay,
			});
			this.timer = window.setTimeout(() => this.connect(), delay);
		});
	}

	close(): void {
		this.closed = true;
		window.clearTimeout(this.timer);
		this.ws?.close();
		this.ws = null;
		this.setState({ status: 'closed', attempts: this.attempts });
	}

	private setState(next: ConnectionState): void {
		this.state = next;
		this.handlers.onState?.(next);
	}
}
