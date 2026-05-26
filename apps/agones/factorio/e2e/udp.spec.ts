import { describe, it, expect } from 'vitest';
import { getFactorioUdpAddress, udpProbe } from './helpers/udp';

describe('agones-factorio UDP listener', () => {
	it('binds the game port and replies to a malformed datagram', async () => {
		const { host, port } = getFactorioUdpAddress();
		const reply = await udpProbe(host, port);
		expect(reply.length).toBeGreaterThan(0);
	});
});
