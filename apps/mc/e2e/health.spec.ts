import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RconClient, waitForRcon } from './helpers/rcon';

describe('MC server health', () => {
	let rcon: RconClient;

	beforeAll(async () => {
		await waitForRcon();
		rcon = new RconClient();
		await rcon.connect();
		await rcon.authenticate();
	});

	afterAll(() => {
		rcon?.disconnect();
	});

	it('responds to RCON list command', async () => {
		const response = await rcon.command('list');
		expect(response).toContain('players online');
	});

	it('reports correct difficulty', async () => {
		const response = await rcon.command('difficulty');
		expect(response.toLowerCase()).toContain('normal');
	});

	it('seed command returns a value', async () => {
		const response = await rcon.command('seed');
		expect(response).toContain('Seed:');
	});
});
