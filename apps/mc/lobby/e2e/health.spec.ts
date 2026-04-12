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
		// Paper's /version is async — the first call returns the
		// "checking version, please wait..." placeholder synchronously
		// while the upstream version-check HTTP call runs in the
		// background. The result is cached, so a second call after a
		// short delay returns the actual version string synchronously.
		await rcon.command('version');
		await new Promise((resolve) => setTimeout(resolve, 2000));
		const response = await rcon.command('version');
		expect(response.toLowerCase()).toContain('paper');
	});
});
