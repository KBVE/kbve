import { describe, expect, it } from 'vitest';
import { AUTH_PORT, connect, logonChallenge, readAtLeast } from './helpers/net';

describe('authserver raw TCP (3724)', () => {
	it('accepts a connection', async () => {
		const socket = await connect(AUTH_PORT);
		expect(socket.remotePort).toBe(AUTH_PORT);
		socket.destroy();
	});

	it('answers a 3.3.5a AUTH_LOGON_CHALLENGE for the seeded admin account', async () => {
		const socket = await connect(AUTH_PORT);
		try {
			socket.write(logonChallenge('admin'));
			const reply = await readAtLeast(socket, 3);
			expect(reply[0]).toBe(0x00);
			expect(reply[2]).toBe(0x00);
			expect(reply.length).toBeGreaterThan(30);
		} finally {
			socket.destroy();
		}
	});
});
