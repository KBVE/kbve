import { describe, expect, it } from 'vitest';
import {
	GATEWAY_PORT,
	GATEWAY_SECOND_PORT,
	connect,
	readAtLeast,
} from './helpers/net';

const SMSG_AUTH_CHALLENGE = 0x01ec;

describe.each([
	['gateway', GATEWAY_PORT],
	['gateway-second', GATEWAY_SECOND_PORT],
])('%s raw TCP world port (%i)', (_name, port) => {
	it('pushes SMSG_AUTH_CHALLENGE on connect', async () => {
		const socket = await connect(port);
		try {
			const packet = await readAtLeast(socket, 6);
			const size = packet.readUInt16BE(0);
			const opcode = packet.readUInt16LE(2);
			expect(size).toBeGreaterThan(0);
			expect(opcode).toBe(SMSG_AUTH_CHALLENGE);
		} finally {
			socket.destroy();
		}
	});
});
