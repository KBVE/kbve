import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RconClient, waitForRcon } from './helpers/rcon';
import { dockerExec, dockerLogs } from './helpers/docker';

describe('MC lobby plugin load', () => {
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

	it('reports AdvancedPortals in /plugins', async () => {
		const response = await rcon.command('plugins');
		expect(response).toMatch(/AdvancedPortals/);
	});

	it('reports Essentials + EssentialsSpawn + EssentialsAntiBuild in /plugins', async () => {
		const response = await rcon.command('plugins');
		expect(response).toMatch(/Essentials(?!\w)/);
		expect(response).toMatch(/EssentialsSpawn/);
		expect(response).toMatch(/EssentialsAntiBuild/);
	});

	it('reports LuckPerms in /plugins', async () => {
		const response = await rcon.command('plugins');
		expect(response).toMatch(/LuckPerms/);
	});

	it('reports kbve-mc-uplink in /plugins', async () => {
		const response = await rcon.command('plugins');
		expect(response).toMatch(/kbve-mc-uplink|uplink/i);
	});

	it('baked AdvancedPortals config enables proxy support', () => {
		const config = dockerExec(
			'cat /data/plugins/AdvancedPortals/config.yaml',
		);
		expect(config).toMatch(/enableProxySupport:\s*true/);
	});

	it('logs no plugin load failures', () => {
		const logs = dockerLogs();
		expect(logs).not.toMatch(
			/Could not load .*plugin|ClassNotFoundException.*Plugin|Could not load 'plugins/i,
		);
	});
});
