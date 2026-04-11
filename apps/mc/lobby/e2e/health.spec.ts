import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RconClient, waitForRcon } from './helpers/rcon';

describe('MC lobby health', () => {
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

	it('reports peaceful difficulty', async () => {
		const response = await rcon.command('difficulty');
		expect(response.toLowerCase()).toContain('peaceful');
	});

	it('reports PaperMC server version', async () => {
		const response = await rcon.command('version');
		expect(response.toLowerCase()).toContain('paper');
	});
});
