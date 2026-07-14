import { describe, it, expect } from 'vitest';
import { ChatKind, Platform } from './generated/chat-schema';
import { chatEnvelope, formatEnvelope } from './codec.js';
import { parseIrcLine, decodeIrcTrailing } from './irc.js';

describe('parseIrcLine', () => {
	it('parses a prefixed PRIVMSG with trailing', () => {
		const p = parseIrcLine(':bob!u@h PRIVMSG #general :hello world');
		expect(p).toEqual({
			nick: 'bob',
			command: 'PRIVMSG',
			params: ['#general'],
			trailing: 'hello world',
		});
	});

	it('parses a prefixless command', () => {
		expect(parseIrcLine('PING :token')).toEqual({
			nick: '',
			command: 'PING',
			params: [],
			trailing: 'token',
		});
	});

	it('returns null for empty input', () => {
		expect(parseIrcLine('')).toBeNull();
	});
});

describe('decodeIrcTrailing', () => {
	it('passes plain chatter through as a message', () => {
		const d = decodeIrcTrailing(
			'PRIVMSG',
			'just talking',
			'bob',
			'#general',
		);
		expect(d).toEqual({
			sender: 'bob',
			content: 'just talking',
			type: 'message',
		});
	});

	it('marks a plain NOTICE', () => {
		const d = decodeIrcTrailing('NOTICE', '+o granted', 'srv', '#general');
		expect(d.type).toBe('notice');
		expect(d.content).toBe('+o granted');
	});

	it('decodes an envelope chat to the in-game sender + platform', () => {
		const env = chatEnvelope(
			ChatKind.CHAT_KIND_CHAT,
			'Hero',
			Platform.PLATFORM_DISCORD,
			'#world-events',
			'hi from discord',
		);
		const d = decodeIrcTrailing(
			'PRIVMSG',
			formatEnvelope(env),
			'relay-bot',
			'#world-events',
		);
		expect(d.type).toBe('message');
		expect(d.sender).toBe('Hero');
		expect(d.platform).toBe('discord');
		expect(d.eventTag).toBeUndefined();
	});

	it('decodes an event envelope with payload + eventTag', () => {
		const env = chatEnvelope(
			ChatKind.CHAT_KIND_EVENT_KILL,
			'Hero',
			Platform.PLATFORM_ISOMETRIC,
			'#world-events',
			'Hero slew the Glass Golem',
			{ target: 'Glass Golem', xp: 100 },
		);
		const d = decodeIrcTrailing(
			'PRIVMSG',
			formatEnvelope(env),
			'relay-bot',
			'#world-events',
		);
		expect(d.type).toBe('event');
		expect(d.eventTag).toBe('EVENT:KILL');
		expect(d.payload).toEqual({ target: 'Glass Golem', xp: 100 });
	});

	it('decodes a custom event, preserving its label', () => {
		const env = chatEnvelope(
			ChatKind.CHAT_KIND_CUSTOM,
			'System',
			Platform.PLATFORM_SYSTEM,
			'#world-events',
			'A storm approaches',
		);
		env.custom_kind = 'WEATHER';
		const d = decodeIrcTrailing(
			'PRIVMSG',
			formatEnvelope(env),
			'relay-bot',
			'#world-events',
		);
		expect(d.type).toBe('event');
		expect(d.eventTag).toBe('EVENT:WEATHER');
	});
});
