import {
	$activeChannel,
	$canSend,
	$channels,
	$connectionStatus,
	$error,
	$nick,
	handleIncoming,
	makeId,
	pushMessage,
	switchChannel,
	systemMessage,
} from './state';

// Plain WebSocket transport for the embed bundle.
// Wraps a single ws connection, decodes binary frames as IRC text, and
// drives state.ts via handleIncoming. No SharedWorker / no cross-tab dedup.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface TransportState {
	ws: WebSocket | null;
	url: string;
	token: string;
	defaultChannel: string;
	reconnectAttempts: number;
	reconnectTimer: number | null;
	manualClose: boolean;
}

const state: TransportState = {
	ws: null,
	url: '',
	token: '',
	defaultChannel: '#general',
	reconnectAttempts: 0,
	reconnectTimer: null,
	manualClose: false,
};

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_MS = 1500;

function buildUrl(wsUrl: string, token: string): string {
	if (!token) return wsUrl;
	const sep = wsUrl.includes('?') ? '&' : '?';
	return `${wsUrl}${sep}token=${encodeURIComponent(token)}`;
}

function scheduleReconnect(): void {
	if (state.manualClose) return;
	if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
		$connectionStatus.set('error');
		$error.set('Reconnect failed after max attempts');
		systemMessage(
			$activeChannel.get(),
			'Disconnected. Reload the page to retry.',
		);
		return;
	}
	const delay = RECONNECT_BASE_MS * Math.pow(1.6, state.reconnectAttempts);
	state.reconnectAttempts += 1;
	state.reconnectTimer = window.setTimeout(() => {
		$connectionStatus.set('connecting');
		systemMessage(
			$activeChannel.get(),
			`Reconnecting (attempt ${state.reconnectAttempts})…`,
		);
		void openSocket();
	}, delay);
}

async function openSocket(): Promise<void> {
	return new Promise((resolve, reject) => {
		try {
			const ws = new WebSocket(buildUrl(state.url, state.token));
			ws.binaryType = 'arraybuffer';
			state.ws = ws;

			ws.onopen = () => {
				state.reconnectAttempts = 0;
				$connectionStatus.set('connected');
				$error.set('');
				// Auto-join the default channel once authenticated handshake
				// settles. Ergo will send 001 → we already system-log, but the
				// JOIN must come from the client.
				const ch = state.defaultChannel;
				ws.send(encoder.encode(`JOIN ${ch}\r\n`));
				const channels = new Map($channels.get());
				if (!channels.has(ch)) {
					channels.set(ch, {
						name: ch,
						topic: '',
						users: [],
						unread: 0,
					});
					$channels.set(channels);
				}
				switchChannel(ch);
				resolve();
			};

			ws.onmessage = (e) => {
				const data = e.data;
				const text =
					typeof data === 'string'
						? data
						: decoder.decode(
								data instanceof ArrayBuffer
									? new Uint8Array(data)
									: data,
							);
				handleIncoming(text, (token) => {
					if (state.ws?.readyState === WebSocket.OPEN) {
						state.ws.send(encoder.encode(`PONG ${token}\r\n`));
					}
				});
			};

			ws.onclose = (e) => {
				const wasConnected = $connectionStatus.get() === 'connected';
				$connectionStatus.set('disconnected');
				if (state.manualClose) return;
				$error.set(`Disconnected (code=${e.code})`);
				if (wasConnected) {
					systemMessage(
						$activeChannel.get(),
						`Disconnected (code=${e.code}). Reconnecting…`,
					);
				}
				scheduleReconnect();
			};

			ws.onerror = () => {
				$connectionStatus.set('error');
				$error.set('WebSocket error');
				// Let onclose handle reconnect — onerror always precedes it.
				reject(new Error('WebSocket error'));
			};
		} catch (err: any) {
			$connectionStatus.set('error');
			$error.set(err?.message ?? 'Connect failed');
			reject(err);
		}
	});
}

export async function connect(
	wsUrl: string,
	token: string,
	defaultChannel: string,
): Promise<void> {
	if (
		$connectionStatus.get() === 'connected' ||
		$connectionStatus.get() === 'connecting'
	) {
		return;
	}
	state.url = wsUrl;
	state.token = token;
	state.defaultChannel = defaultChannel;
	state.manualClose = false;
	state.reconnectAttempts = 0;
	$canSend.set(token.length > 0);
	$connectionStatus.set('connecting');
	$error.set('');
	try {
		await openSocket();
	} catch {
		// onclose will schedule a reconnect; nothing else to do here.
	}
}

export function disconnect(): void {
	state.manualClose = true;
	if (state.reconnectTimer !== null) {
		clearTimeout(state.reconnectTimer);
		state.reconnectTimer = null;
	}
	try {
		state.ws?.close(1000, 'client-close');
	} catch {
		/* ignore */
	}
	state.ws = null;
	$connectionStatus.set('disconnected');
}

export function sendRaw(line: string): void {
	if (state.ws?.readyState !== WebSocket.OPEN) return;
	state.ws.send(encoder.encode(line.endsWith('\r\n') ? line : `${line}\r\n`));
}

export function sendChat(content: string): void {
	if (!$canSend.get()) return;
	const channel = $activeChannel.get();
	sendRaw(`PRIVMSG ${channel} :${content}`);
	// Echo locally so the sender sees their own message immediately
	// (the IRC server won't echo PRIVMSG back to the originator).
	pushMessage({
		id: makeId(),
		nick: $nick.get() || 'me',
		content,
		channel,
		timestamp: Date.now(),
		type: 'message',
	});
}

export function joinChannel(channel: string): void {
	sendRaw(`JOIN ${channel}`);
	const channels = new Map($channels.get());
	if (!channels.has(channel)) {
		channels.set(channel, {
			name: channel,
			topic: '',
			users: [],
			unread: 0,
		});
		$channels.set(channels);
	}
	switchChannel(channel);
}

export function partChannel(channel: string): void {
	sendRaw(`PART ${channel}`);
	const channels = new Map($channels.get());
	channels.delete(channel);
	$channels.set(channels);
	const remaining = Array.from(channels.keys());
	if (remaining.length > 0) switchChannel(remaining[0]);
}
