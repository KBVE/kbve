import { describe, it, expect, afterAll } from 'vitest';
import { RconClient, getRconConfig } from './helpers/rcon';

const { password } = getRconConfig();
const skip = password === '';

describe.skipIf(skip)('agones-factorio RCON', () => {
	let client: RconClient;

	afterAll(() => {
		client?.close();
	});

	it('authenticates with the configured password', async () => {
		client = await RconClient.connect();
		await expect(client.authenticate(password)).resolves.toBeUndefined();
	});

	it('executes /players online and returns a response', async () => {
		const out = await client.exec('/players online');
		expect(out).toMatch(/Online players|player|\(0\)/i);
	});
});
