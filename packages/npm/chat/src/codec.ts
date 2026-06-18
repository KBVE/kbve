import {
	ChatKind,
	Platform,
	ChatEnvelopeSchema,
	type ChatEnvelope,
	type ChatKindValue,
	type PlatformValue,
} from './generated/chat-schema';

const KIND_PREFIX = 'CHAT_KIND_';
const PLATFORM_PREFIX = 'PLATFORM_';
const EVENT_ENUM_PREFIX = 'EVENT_';
const EVENT_WIRE_PREFIX = 'EVENT:';

const IRC_LINE_MAX_BYTES = 512;
const CRLF_BYTES = 2;

const encoder = new TextEncoder();
const byteLen = (s: string): number => encoder.encode(s).length;

const KIND_NAME_BY_VALUE: ReadonlyMap<number, string> = new Map(
	Object.entries(ChatKind).map(([name, value]) => [value, name]),
);
const PLATFORM_NAME_BY_VALUE: ReadonlyMap<number, string> = new Map(
	Object.entries(Platform).map(([name, value]) => [value, name]),
);

export function wireTagForKind(
	kind: ChatKindValue,
	customKind?: string,
): string {
	if (kind === ChatKind.CHAT_KIND_CUSTOM) {
		return `${EVENT_WIRE_PREFIX}${customKind ?? 'CUSTOM'}`;
	}
	const name = KIND_NAME_BY_VALUE.get(kind);
	if (!name) return `${EVENT_WIRE_PREFIX}CUSTOM`;
	const body = name.slice(KIND_PREFIX.length);
	if (body.startsWith(EVENT_ENUM_PREFIX)) {
		return `${EVENT_WIRE_PREFIX}${body.slice(EVENT_ENUM_PREFIX.length)}`;
	}
	return body;
}

export function kindFromWireTag(
	tag: string,
): { kind: ChatKindValue; customKind?: string } | null {
	if (tag.startsWith(EVENT_WIRE_PREFIX)) {
		const rest = tag.slice(EVENT_WIRE_PREFIX.length);
		const name = `${KIND_PREFIX}${EVENT_ENUM_PREFIX}${rest}`;
		if (name in ChatKind) {
			return { kind: ChatKind[name as keyof typeof ChatKind] };
		}
		return { kind: ChatKind.CHAT_KIND_CUSTOM, customKind: rest };
	}
	const name = `${KIND_PREFIX}${tag}`;
	if (name in ChatKind) {
		return { kind: ChatKind[name as keyof typeof ChatKind] };
	}
	return null;
}

export function platformToWire(platform: PlatformValue): string {
	const name = PLATFORM_NAME_BY_VALUE.get(platform);
	if (!name) return 'unknown';
	return name.slice(PLATFORM_PREFIX.length).toLowerCase();
}

export function platformFromWire(value: string): PlatformValue {
	const name = `${PLATFORM_PREFIX}${value.toUpperCase()}`;
	if (name in Platform) return Platform[name as keyof typeof Platform];
	return Platform.PLATFORM_UNSPECIFIED;
}

export function formatEnvelope(env: ChatEnvelope): string {
	const tag = wireTagForKind(env.kind, env.custom_kind);
	const platform = platformToWire(env.platform);
	let body = `[${tag}] ${env.sender}@${platform}: ${env.content}`;
	if (env.payload && Object.keys(env.payload).length > 0) {
		body += ` ${JSON.stringify(env.payload)}`;
	}
	return body;
}

export interface ParseContext {
	channel?: string;
	timestampMs?: number;
}

export function parseEnvelope(
	content: string,
	ctx: ParseContext = {},
): ChatEnvelope | null {
	if (!content.startsWith('[')) return null;
	const close = content.indexOf('] ');
	if (close < 0) return null;
	const tag = content.slice(1, close);

	const afterTag = content.slice(close + 2);
	const sep = afterTag.indexOf(': ');
	if (sep < 0) return null;
	const senderPlatform = afterTag.slice(0, sep);
	const rest = afterTag.slice(sep + 2);

	const at = senderPlatform.lastIndexOf('@');
	const sender = at >= 0 ? senderPlatform.slice(0, at) : senderPlatform;
	const platformStr = at >= 0 ? senderPlatform.slice(at + 1) : 'unknown';

	const parsedKind = kindFromWireTag(tag);
	if (!parsedKind) return null;

	let text = rest;
	let payload: Record<string, unknown> | undefined;
	const jsonIdx = rest.indexOf(' {');
	if (jsonIdx >= 0) {
		const maybe = rest.slice(jsonIdx + 1).trim();
		try {
			const obj: unknown = JSON.parse(maybe);
			if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
				payload = obj as Record<string, unknown>;
				text = rest.slice(0, jsonIdx);
			}
		} catch {
			// trailing brace was part of the content, not a payload
		}
	}

	const env: ChatEnvelope = {
		kind: parsedKind.kind,
		sender,
		platform: platformFromWire(platformStr),
		channel: ctx.channel ?? '',
		content: text,
		...(payload ? { payload } : {}),
		...(parsedKind.customKind
			? { custom_kind: parsedKind.customKind }
			: {}),
		...(ctx.timestampMs !== undefined
			? { timestamp_ms: ctx.timestampMs }
			: {}),
	};
	return ChatEnvelopeSchema.parse(env);
}

export function toIrcLine(
	env: ChatEnvelope,
	command: 'PRIVMSG' | 'NOTICE' = 'PRIVMSG',
	maxBytes = IRC_LINE_MAX_BYTES,
): string {
	const tag = wireTagForKind(env.kind, env.custom_kind);
	const platform = platformToWire(env.platform);
	const head = `${command} ${env.channel} :[${tag}] ${env.sender}@${platform}: `;
	const payloadStr =
		env.payload && Object.keys(env.payload).length > 0
			? ` ${JSON.stringify(env.payload)}`
			: '';
	const budget = maxBytes - CRLF_BYTES - byteLen(head);

	if (byteLen(env.content) + byteLen(payloadStr) <= budget) {
		return `${head}${env.content}${payloadStr}`;
	}
	if (byteLen(env.content) <= budget) {
		return `${head}${env.content}`;
	}
	let content = env.content;
	while (content.length > 0 && byteLen(content) > budget) {
		content = content.slice(0, -1);
	}
	return `${head}${content}`;
}

export function chatEnvelope(
	kind: ChatKindValue,
	sender: string,
	platform: PlatformValue,
	channel: string,
	content: string,
	payload?: Record<string, unknown>,
): ChatEnvelope {
	return ChatEnvelopeSchema.parse({
		kind,
		sender,
		platform,
		channel,
		content,
		...(payload ? { payload } : {}),
	});
}

export function noticeEnvelope(
	sender: string,
	channel: string,
	content: string,
	platform: PlatformValue = Platform.PLATFORM_IRC,
): ChatEnvelope {
	return chatEnvelope(
		ChatKind.CHAT_KIND_NOTICE,
		sender,
		platform,
		channel,
		content,
	);
}
