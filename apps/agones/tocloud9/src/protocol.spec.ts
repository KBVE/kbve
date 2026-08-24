import { describe, expect, it } from 'vitest';
import { AUTH_LOGON_CHALLENGE, logonChallenge } from './protocol';

describe('logonChallenge', () => {
	it('frames the body length in the 4 byte header', () => {
		const packet = logonChallenge('admin');
		expect(packet[0]).toBe(AUTH_LOGON_CHALLENGE);
		expect(packet[1]).toBe(0x08);
		expect(packet.readUInt16LE(2)).toBe(packet.length - 4);
	});

	it('uppercases the account and stores its length', () => {
		const packet = logonChallenge('admin');
		const nameLength = packet[packet.length - 6];
		expect(nameLength).toBe(5);
		expect(packet.subarray(packet.length - 5).toString('ascii')).toBe(
			'ADMIN',
		);
	});

	it('advertises the 3.3.5a client version and build', () => {
		const body = logonChallenge('admin').subarray(4);
		expect(body.subarray(0, 4).toString('ascii')).toBe('WoW\0');
		expect([body[4], body[5], body[6]]).toEqual([3, 3, 5]);
		expect(body.readUInt16LE(7)).toBe(12340);
	});

	it('honours a non-default build', () => {
		expect(logonChallenge('admin', 11723).subarray(4).readUInt16LE(7)).toBe(
			11723,
		);
	});

	it('grows the packet with the account name', () => {
		const short = logonChallenge('ab');
		const long = logonChallenge('abcdef');
		expect(long.length - short.length).toBe(4);
	});
});
