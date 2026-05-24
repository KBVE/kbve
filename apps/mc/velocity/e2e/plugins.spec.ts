import { describe, it, expect } from 'vitest';
import { dockerLogs } from './helpers/docker';

describe('MC velocity proxy plugins', () => {
	it('loads kbve-velocity-commands', () => {
		const logs = dockerLogs();
		expect(logs).toMatch(/KBVE Velocity Commands/);
	});

	it('loads LuckPerms-Velocity', () => {
		const logs = dockerLogs();
		expect(logs).toMatch(/LuckPerms v\d/);
	});

	it('logs no plugin discovery errors', () => {
		const logs = dockerLogs();
		expect(logs).not.toMatch(
			/Couldn't load plugin|ClassNotFoundException.*Plugin|Failed to load plugin/i,
		);
	});
});
