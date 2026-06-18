import { describe, it, expect } from 'vitest';
import { ChatKind, Platform } from './generated/chat-schema';
import {
	parseEnvelope,
	formatEnvelope,
	toIrcLine,
	chatEnvelope,
	noticeEnvelope,
	wireTagForKind,
	kindFromWireTag,
	platformToWire,
	platformFromWire,
} from './codec.js';

const WIRE_TAGS: Record<number, string> = {
	[ChatKind.CHAT_KIND_CHAT]: 'CHAT',
	[ChatKind.CHAT_KIND_SYSTEM]: 'SYSTEM',
	[ChatKind.CHAT_KIND_JOIN]: 'JOIN',
	[ChatKind.CHAT_KIND_PART]: 'PART',
	[ChatKind.CHAT_KIND_NOTICE]: 'NOTICE',
	[ChatKind.CHAT_KIND_EVENT_KILL]: 'EVENT:KILL',
	[ChatKind.CHAT_KIND_EVENT_RARE_DROP]: 'EVENT:RARE_DROP',
	[ChatKind.CHAT_KIND_EVENT_CAPTURE]: 'EVENT:CAPTURE',
	[ChatKind.CHAT_KIND_EVENT_QUEST_COMPLETE]: 'EVENT:QUEST_COMPLETE',
	[ChatKind.CHAT_KIND_EVENT_AREA_UNLOCKED]: 'EVENT:AREA_UNLOCKED',
	[ChatKind.CHAT_KIND_EVENT_DEATH]: 'EVENT:DEATH',
	[ChatKind.CHAT_KIND_EVENT_CRAFT]: 'EVENT:CRAFT',
};

describe('wire tag <-> kind', () => {
	for (const [value, tag] of Object.entries(WIRE_TAGS)) {
		const kind = Number(value);
		it(`maps ${tag} both ways`, () => {
			expect(wireTagForKind(kind)).toBe(tag);
			expect(kindFromWireTag(tag)).toEqual({ kind });
		});
	}

	it('routes unknown EVENT:* tags to CUSTOM with preserved label', () => {
		expect(kindFromWireTag('EVENT:WEATHER')).toEqual({
			kind: ChatKind.CHAT_KIND_CUSTOM,
			customKind: 'WEATHER',
		});
		expect(wireTagForKind(ChatKind.CHAT_KIND_CUSTOM, 'WEATHER')).toBe(
			'EVENT:WEATHER',
		);
	});

	it('returns null for non-envelope tags', () => {
		expect(kindFromWireTag('GARBAGE')).toBeNull();
	});
});

describe('platform <-> wire', () => {
	it('round-trips every platform', () => {
		for (const value of Object.values(Platform)) {
			if (value === Platform.PLATFORM_UNSPECIFIED) continue;
			const wire = platformToWire(value);
			expect(platformFromWire(wire)).toBe(value);
		}
	});

	it('uses lowercase short names', () => {
		expect(platformToWire(Platform.PLATFORM_NEXUS_DEFENSE)).toBe(
			'nexus_defense',
		);
		expect(platformToWire(Platform.PLATFORM_DISCORD)).toBe('discord');
	});
});

describe('parseEnvelope / formatEnvelope round-trip', () => {
	for (const [value, tag] of Object.entries(WIRE_TAGS)) {
		const kind = Number(value);
		it(`round-trips ${tag}`, () => {
			const env = chatEnvelope(
				kind,
				'Hero',
				Platform.PLATFORM_DISCORD,
				'#world-events',
				'something happened',
			);
			const wire = formatEnvelope(env);
			expect(wire.startsWith(`[${tag}] Hero@discord: `)).toBe(true);

			const parsed = parseEnvelope(wire, { channel: '#world-events' });
			expect(parsed).not.toBeNull();
			expect(parsed?.kind).toBe(kind);
			expect(parsed?.sender).toBe('Hero');
			expect(parsed?.platform).toBe(Platform.PLATFORM_DISCORD);
			expect(parsed?.content).toBe('something happened');
		});
	}

	it('round-trips an event payload', () => {
		const env = chatEnvelope(
			ChatKind.CHAT_KIND_EVENT_KILL,
			'Hero',
			Platform.PLATFORM_DISCORD,
			'#world-events',
			'Hero slew the Glass Golem',
			{ target: 'Glass Golem', xp: 100 },
		);
		const wire = formatEnvelope(env);
		const parsed = parseEnvelope(wire, { channel: '#world-events' });
		expect(parsed?.content).toBe('Hero slew the Glass Golem');
		expect(parsed?.payload).toEqual({ target: 'Glass Golem', xp: 100 });
	});

	it('round-trips a custom event', () => {
		const env = chatEnvelope(
			ChatKind.CHAT_KIND_CUSTOM,
			'System',
			Platform.PLATFORM_SYSTEM,
			'#world-events',
			'A storm approaches',
		);
		env.custom_kind = 'WEATHER';
		const wire = formatEnvelope(env);
		expect(wire.startsWith('[EVENT:WEATHER] System@system: ')).toBe(true);
		const parsed = parseEnvelope(wire, { channel: '#world-events' });
		expect(parsed?.kind).toBe(ChatKind.CHAT_KIND_CUSTOM);
		expect(parsed?.custom_kind).toBe('WEATHER');
	});

	it('keeps a brace-bearing content when the tail is not JSON', () => {
		const env = chatEnvelope(
			ChatKind.CHAT_KIND_CHAT,
			'bob',
			Platform.PLATFORM_IRC,
			'#general',
			'use {curly} braces',
		);
		const parsed = parseEnvelope(formatEnvelope(env), {
			channel: '#general',
		});
		expect(parsed?.content).toBe('use {curly} braces');
		expect(parsed?.payload).toBeUndefined();
	});
});

describe('parseEnvelope rejects non-envelope lines', () => {
	it('returns null for plain IRC chatter', () => {
		expect(parseEnvelope('just chatting')).toBeNull();
	});
});

describe('NOTICE', () => {
	it('builds and round-trips a NOTICE envelope', () => {
		const env = noticeEnvelope('Server', '#general', '+o granted');
		expect(env.kind).toBe(ChatKind.CHAT_KIND_NOTICE);
		const parsed = parseEnvelope(formatEnvelope(env), {
			channel: '#general',
		});
		expect(parsed?.kind).toBe(ChatKind.CHAT_KIND_NOTICE);
		expect(parsed?.content).toBe('+o granted');
	});

	it('toIrcLine emits a NOTICE command', () => {
		const env = noticeEnvelope('Server', '#general', 'mode change');
		expect(toIrcLine(env, 'NOTICE').startsWith('NOTICE #general :')).toBe(
			true,
		);
	});
});

describe('toIrcLine 512-byte cap', () => {
	it('drops payload then truncates content to fit', () => {
		const env = chatEnvelope(
			ChatKind.CHAT_KIND_CHAT,
			'bob',
			Platform.PLATFORM_IRC,
			'#general',
			'x'.repeat(2000),
			{ big: 'y'.repeat(500) },
		);
		const line = toIrcLine(env);
		expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(510);
		expect(line.includes('big')).toBe(false);
	});
});
