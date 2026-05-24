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

	it('kbve-mc-uplink loaded its portal config', () => {
		const logs = dockerLogs();
		expect(logs).toMatch(/kbve-mc-uplink portals: .+→.+/);
	});

	it('portals.yml gets saved to plugin data folder on first boot', () => {
		const yaml = dockerExec('cat /data/plugins/kbve-mc-uplink/portals.yml');
		expect(yaml).toMatch(/portals:/);
		expect(yaml).toMatch(/target:/);
	});

	it('logs no plugin load failures', () => {
		const logs = dockerLogs();
		expect(logs).not.toMatch(
			/Could not load .*plugin|ClassNotFoundException.*Plugin|Could not load 'plugins/i,
		);
	});
});
