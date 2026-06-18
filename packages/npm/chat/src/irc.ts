import { ChatKind } from './generated/chat-schema';
import { parseEnvelope, platformToWire, wireTagForKind } from './codec.js';

export interface ParsedIrcMessage {
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
		nick = rest.slice(1, spaceIdx).split('!')[0];
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

export type DecodedMessageType = 'message' | 'notice' | 'event' | 'system';

export interface DecodedMessage {
	sender: string;
	content: string;
	type: DecodedMessageType;
	platform?: string;
	eventTag?: string;
	payload?: Record<string, unknown>;
}

export function decodeIrcTrailing(
	command: string,
	trailing: string,
	fallbackNick: string,
	channel: string,
): DecodedMessage {
	const env = parseEnvelope(trailing, { channel });
	if (!env) {
		return {
			sender: fallbackNick,
			content: trailing,
			type: command === 'NOTICE' ? 'notice' : 'message',
		};
	}

	const tag = wireTagForKind(env.kind, env.custom_kind);
	const isEvent = tag.startsWith('EVENT:');
	let type: DecodedMessageType;
	if (isEvent) type = 'event';
	else if (env.kind === ChatKind.CHAT_KIND_NOTICE) type = 'notice';
	else if (env.kind === ChatKind.CHAT_KIND_SYSTEM) type = 'system';
	else type = 'message';

	return {
		sender: env.sender || fallbackNick,
		content: env.content,
		type,
		platform: platformToWire(env.platform),
		...(isEvent ? { eventTag: tag } : {}),
		...(env.payload ? { payload: env.payload } : {}),
	};
}
