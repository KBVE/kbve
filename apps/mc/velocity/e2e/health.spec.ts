import { describe, it, expect } from 'vitest';
import { tcpConnect, mcStatusPing, getVelocityAddress } from './helpers/tcp';

describe('MC velocity proxy health', () => {
	it('accepts TCP connections on the proxy port', async () => {
		await expect(tcpConnect()).resolves.toBeUndefined();
	});

	it('responds to a Minecraft server list ping', async () => {
		const { host, port } = getVelocityAddress();
		const response = await mcStatusPing(host, port);
		expect(response.length).toBeGreaterThan(4);
	});
});
