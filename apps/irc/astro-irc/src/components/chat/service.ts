import {
	$activeChannel,
	$channels,
	$connectionStatus,
	$error,
	$nick,
	handleIncoming,
	makeId,
	pushMessage,
	switchChannel,
	systemMessage,
	type ConnectionStatus,
} from '../../lib/chat/store';

export * from '../../lib/chat/store';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ---------------------------------------------------------------------------
// Worker → UI bridge
//
// The ws-worker posts status + message events on the `kbve_ws_events`
// BroadcastChannel. We subscribe here instead of calling kbve.ws.onMessage
// / kbve.ws.onStatus through Comlink — Comlink forwards method args via
// postMessage, and functions aren't structured-cloneable, so passing raw
// callbacks across the SharedWorker boundary raised DataCloneError and
// killed the connection handshake before it completed.
//
// Keeping the subscription at module scope means reconnects reuse the same
// channel instead of stacking subscriptions on every connect() call.
// ---------------------------------------------------------------------------
let eventsChannel: BroadcastChannel | null = null;

function ensureEventsSubscription(): void {
	if (eventsChannel) return;
	if (typeof BroadcastChannel === 'undefined') {
		console.warn(
			'[chat] BroadcastChannel unavailable — ws events will not reach the UI',
		);
		return;
	}

	eventsChannel = new BroadcastChannel('kbve_ws_events');
	eventsChannel.onmessage = (e: MessageEvent) => {
		const evt = e.data;
		if (!evt || typeof evt !== 'object') return;

		if (evt.type === 'status') {
			const status = evt.status as string;
			const code = typeof evt.code === 'number' ? evt.code : undefined;
			const reason = typeof evt.reason === 'string' ? evt.reason : '';
			const wasClean =
				typeof evt.wasClean === 'boolean' ? evt.wasClean : undefined;

			if (status === 'connected') {
				$connectionStatus.set('connected');
				$error.set('');
				systemMessage($activeChannel.get(), 'Connected to IRC');
			} else if (status === 'disconnected' || status === 'error') {
				$connectionStatus.set(status as ConnectionStatus);
				const detail =
					code !== undefined
						? `code=${code}${reason ? ` reason="${reason}"` : ''}${
								wasClean === false ? ' (abnormal)' : ''
							}`
						: reason || 'no detail';
				const message = `${status === 'error' ? 'WS error' : 'Disconnected'}: ${detail}`;
				console.warn('[chat]', message, evt);
				$error.set(message);
				systemMessage($activeChannel.get(), message);
			} else if (status === 'reconnecting') {
				$connectionStatus.set('connecting');
				systemMessage($activeChannel.get(), 'Reconnecting…');
			} else if (status === 'failed') {
				$connectionStatus.set('error');
				$error.set('Reconnect failed — give up after retries');
				systemMessage(
					$activeChannel.get(),
					'Reconnect failed — give up after retries',
				);
			}
			return;
		}

		if (evt.type === 'message') {
			const data = evt.data;
			const text =
				typeof data === 'string'
					? data
					: decoder.decode(
							data instanceof ArrayBuffer
								? new Uint8Array(data)
								: data,
						);
			handleIncoming(text, {
				onPing: (token) => {
					const kbve = (window as any).kbve;
					if (kbve?.ws) {
						kbve.ws.send(encoder.encode(`PONG ${token}\r\n`));
					}
				},
				onWelcome: () => joinChannel($activeChannel.get()),
			});
			return;
		}
	};
}

export async function connect(wsUrl: string, token?: string): Promise<void> {
	if ($connectionStatus.get() === 'connected') return;

	$connectionStatus.set('connecting');
	$error.set('');

	try {
		const kbve = (window as any).kbve;
		if (!kbve?.ws) {
			throw new Error('Droid WebSocket worker not initialized');
		}

		const url = token
			? `${wsUrl}${wsUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
			: wsUrl;

		// Subscribe BEFORE connect so we don't miss the initial 'connected'
		// status event from the worker.
		ensureEventsSubscription();

		await kbve.ws.connect(url);
	} catch (err: any) {
		$connectionStatus.set('error');
		$error.set(err.message ?? 'Connection failed');
	}
}

export async function disconnect(): Promise<void> {
	try {
		const kbve = (window as any).kbve;
		if (kbve?.ws) await kbve.ws.close();
	} finally {
		$connectionStatus.set('disconnected');
		systemMessage($activeChannel.get(), 'Disconnected from IRC');
	}
}

export async function sendMessage(content: string): Promise<void> {
	const channel = $activeChannel.get();
	const nick = $nick.get();

	if (!content.trim()) return;

	const kbve = (window as any).kbve;
	if (!kbve?.ws) return;

	const raw = `PRIVMSG ${channel} :${content}\r\n`;
	await kbve.ws.send(encoder.encode(raw));

	pushMessage({
		id: makeId(),
		nick,
		content,
		channel,
		timestamp: Date.now(),
		type: 'message',
	});
}

export function joinChannel(channel: string): void {
	const kbve = (window as any).kbve;
	if (!kbve?.ws) return;

	const raw = `JOIN ${channel}\r\n`;
	kbve.ws.send(encoder.encode(raw));

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
	const kbve = (window as any).kbve;
	if (!kbve?.ws) return;

	const raw = `PART ${channel}\r\n`;
	kbve.ws.send(encoder.encode(raw));

	const channels = new Map($channels.get());
	channels.delete(channel);
	$channels.set(channels);

	const remaining = Array.from(channels.keys());
	if (remaining.length > 0) {
		switchChannel(remaining[0]);
	}
}
