import { describe, it, expect } from 'vitest';
import { dockerLogs, dockerRunning } from './helpers/docker';

describe('agones-factorio boot smoke', () => {
	it('container is still running after scenario load', () => {
		expect(dockerRunning()).toBe(true);
	});

	it('logs the Factorio server-ready marker', () => {
		const logs = dockerLogs();
		expect(logs).toMatch(/Hosting game/);
	});

	it('loaded the kbve scenario, not the default', () => {
		const logs = dockerLogs();
		expect(logs).toMatch(/scenarios\/kbve|scenario.*kbve/i);
	});

	it('opens the UDP game socket on the expected port', () => {
		const logs = dockerLogs();
		expect(logs).toMatch(
			/Opening socket at .*:34197|Hosting game at .*:34197/,
		);
	});
});
