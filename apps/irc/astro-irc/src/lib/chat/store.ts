import { atom, computed } from 'nanostores';
import { parseIrcLine, decodeIrcTrailing } from '@kbve/chat';

export interface ChatMessage {
	id: string;
	nick: string;
	content: string;
	channel: string;
	timestamp: number;
	type: 'message' | 'join' | 'part' | 'system' | 'notice' | 'event';
	platform?: string;
	eventTag?: string;
	payload?: Record<string, unknown>;
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

export const DEFAULT_CHANNEL = '#general';
export const MAX_MESSAGES_PER_CHANNEL = 500;

export const $connectionStatus = atom<ConnectionStatus>('disconnected');
export const $activeChannel = atom<string>(DEFAULT_CHANNEL);
export const $channels = atom<Map<string, ChannelState>>(new Map());
export const $nick = atom<string>('');
export const $error = atom<string>('');

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

export function pushMessage(msg: ChatMessage): void {
	const store = new Map($messageStore.get());
	const msgs = store.get(msg.channel) ?? [];
	const updated = [...msgs, msg].slice(-MAX_MESSAGES_PER_CHANNEL);
	store.set(msg.channel, updated);
	$messageStore.set(store);

	for (const fn of listeners) fn(msg);

	if (
		msg.channel !== $activeChannel.get() &&
		(msg.type === 'message' || msg.type === 'event')
	) {
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

export function resetCore(): void {
	$connectionStatus.set('disconnected');
	$channels.set(new Map());
	$nick.set('');
	$error.set('');
	$messageStore.set(new Map());
}

export interface IncomingHandlers {
	onPing?: (token: string) => void;
	onWelcome?: () => void;
}

export function handleIncoming(
	raw: string,
	handlers: IncomingHandlers = {},
): void {
	const lines = raw.split('\r\n').filter(Boolean);

	for (const line of lines) {
		if (line.startsWith('PING')) {
			handlers.onPing?.(line.slice(5));
			continue;
		}

		const parsed = parseIrcLine(line);
		if (!parsed) continue;

		switch (parsed.command) {
			case 'PRIVMSG':
			case 'NOTICE': {
				const channel = parsed.params[0] ?? '';
				const decoded = decodeIrcTrailing(
					parsed.command,
					parsed.trailing ?? '',
					parsed.nick,
					channel,
				);
				pushMessage({
					id: makeId(),
					nick: decoded.sender,
					content: decoded.content,
					channel,
					timestamp: Date.now(),
					type: decoded.type,
					...(decoded.platform ? { platform: decoded.platform } : {}),
					...(decoded.eventTag ? { eventTag: decoded.eventTag } : {}),
					...(decoded.payload ? { payload: decoded.payload } : {}),
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
				handlers.onWelcome?.();
				break;
			}
			default:
				break;
		}
	}
}
