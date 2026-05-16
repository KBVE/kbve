import { atom, computed } from 'nanostores';

export interface ChatMessage {
	id: string;
	nick: string;
	content: string;
	channel: string;
	timestamp: number;
	type: 'message' | 'join' | 'part' | 'system';
}

export interface ChannelState {
	name: string;
	topic: string;
	users: string[];
	unread: number;
}

export type ConnectionStatus =
	| 'disconnected'
	| 'connecting'
	| 'connected'
	| 'error';

export const $connectionStatus = atom<ConnectionStatus>('disconnected');
export const $activeChannel = atom<string>('#general');
export const $channels = atom<Map<string, ChannelState>>(new Map());
export const $nick = atom<string>('');
export const $error = atom<string>('');
export const $canSend = atom<boolean>(false);
export const $avatarUrl = atom<string>('');

const $messageStore = atom<Map<string, ChatMessage[]>>(new Map());

export const $activeMessages = computed(
	[$messageStore, $activeChannel],
	(store, channel) => store.get(channel) ?? [],
);

export const $channelList = computed([$channels], (channels) =>
	Array.from(channels.values()).sort((a, b) => a.name.localeCompare(b.name)),
);

export const $activeUsers = computed(
	[$channels, $activeChannel],
	(channels, active) => channels.get(active)?.users ?? [],
);

type MessageListener = (msg: ChatMessage) => void;
const listeners = new Set<MessageListener>();

export function onMessage(fn: MessageListener): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

const MAX_MESSAGES_PER_CHANNEL = 500;

export function pushMessage(msg: ChatMessage): void {
	const store = new Map($messageStore.get());
	const msgs = store.get(msg.channel) ?? [];
	const updated = [...msgs, msg].slice(-MAX_MESSAGES_PER_CHANNEL);
	store.set(msg.channel, updated);
	$messageStore.set(store);

	for (const fn of listeners) fn(msg);

	if (msg.channel !== $activeChannel.get() && msg.type === 'message') {
		const channels = new Map($channels.get());
		const ch = channels.get(msg.channel);
		if (ch) {
			channels.set(msg.channel, { ...ch, unread: ch.unread + 1 });
			$channels.set(channels);
		}
	}
}

export function makeId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function systemMessage(channel: string, content: string): void {
	pushMessage({
		id: makeId(),
		nick: '',
		content,
		channel,
		timestamp: Date.now(),
		type: 'system',
	});
}

export function switchChannel(channel: string): void {
	$activeChannel.set(channel);
	const channels = new Map($channels.get());
	const ch = channels.get(channel);
	if (ch) {
		channels.set(channel, { ...ch, unread: 0 });
		$channels.set(channels);
	}
}

export function resetState(): void {
	$connectionStatus.set('disconnected');
	$channels.set(new Map());
	$nick.set('');
	$error.set('');
	$messageStore.set(new Map());
	$canSend.set(false);
	$avatarUrl.set('');
}

// IRC line parser ------------------------------------------------------------

interface ParsedIrcMessage {
	nick: string;
	command: string;
	params: string[];
	trailing?: string;
}

export function parseIrcLine(line: string): ParsedIrcMessage | null {
	let nick = '';
	let rest = line;

	if (rest.startsWith(':')) {
		const spaceIdx = rest.indexOf(' ');
		if (spaceIdx === -1) return null;
		const prefix = rest.slice(1, spaceIdx);
		nick = prefix.split('!')[0];
		rest = rest.slice(spaceIdx + 1);
	}

	let trailing: string | undefined;
	const trailIdx = rest.indexOf(' :');
	if (trailIdx !== -1) {
		trailing = rest.slice(trailIdx + 2);
		rest = rest.slice(0, trailIdx);
	}

	const parts = rest.split(' ').filter(Boolean);
	if (parts.length === 0) return null;

	return { nick, command: parts[0], params: parts.slice(1), trailing };
}

// Handler — invoked by the transport on each inbound IRC text frame.
// `respondPong` lets the transport reply to PING without coupling state.ts
// to a WebSocket reference.
export function handleIncoming(
	raw: string,
	respondPong: (token: string) => void,
): void {
	const lines = raw.split('\r\n').filter(Boolean);

	for (const line of lines) {
		if (line.startsWith('PING')) {
			respondPong(line.slice(5));
			continue;
		}

		const parsed = parseIrcLine(line);
		if (!parsed) continue;

		switch (parsed.command) {
			case 'PRIVMSG': {
				pushMessage({
					id: makeId(),
					nick: parsed.nick,
					content: parsed.trailing ?? '',
					channel: parsed.params[0],
					timestamp: Date.now(),
					type: 'message',
				});
				break;
			}
			case 'JOIN': {
				const channel = parsed.params[0] || parsed.trailing || '';
				const channels = new Map($channels.get());
				const ch = channels.get(channel);
				if (ch && !ch.users.includes(parsed.nick)) {
					channels.set(channel, {
						...ch,
						users: [...ch.users, parsed.nick],
					});
					$channels.set(channels);
				}
				pushMessage({
					id: makeId(),
					nick: parsed.nick,
					content: `${parsed.nick} joined ${channel}`,
					channel,
					timestamp: Date.now(),
					type: 'join',
				});
				break;
			}
			case 'PART': {
				const channel = parsed.params[0];
				const channels = new Map($channels.get());
				const ch = channels.get(channel);
				if (ch) {
					channels.set(channel, {
						...ch,
						users: ch.users.filter((u) => u !== parsed.nick),
					});
					$channels.set(channels);
				}
				pushMessage({
					id: makeId(),
					nick: parsed.nick,
					content: `${parsed.nick} left ${channel}`,
					channel,
					timestamp: Date.now(),
					type: 'part',
				});
				break;
			}
			case '332': {
				const channel = parsed.params[1];
				const topic = parsed.trailing ?? '';
				const channels = new Map($channels.get());
				const ch = channels.get(channel);
				if (ch) {
					channels.set(channel, { ...ch, topic });
					$channels.set(channels);
				}
				break;
			}
			case '353': {
				const channel = parsed.params[2];
				const nicks = (parsed.trailing ?? '')
					.split(' ')
					.filter(Boolean);
				const channels = new Map($channels.get());
				const ch = channels.get(channel);
				if (ch) {
					channels.set(channel, {
						...ch,
						users: Array.from(new Set([...ch.users, ...nicks])),
					});
					$channels.set(channels);
				}
				break;
			}
			case '001': {
				if (parsed.params[0]) $nick.set(parsed.params[0]);
				systemMessage(
					$activeChannel.get(),
					parsed.trailing ?? 'Connected',
				);
				break;
			}
			default:
				break;
		}
	}
}
