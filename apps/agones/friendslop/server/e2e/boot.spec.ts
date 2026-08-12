import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { dockerRunning } from './helpers/docker';

const host = process.env.FS_HOST ?? '127.0.0.1';
const port = process.env.FS_PORT ?? '7980';

const base = `http://${host}:${port}`;

function get(path: string): string {
	return execSync(`curl -fsS ${base}${path}`, { encoding: 'utf8' }).trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('friendslop-server boot smoke', () => {
	it('container is still running', () => {
		expect(dockerRunning()).toBe(true);
	});

	it('healthz returns ok', () => {
		expect(get('/healthz')).toBe('ok');
	});

	// The sim runs on its own thread; a served /healthz proves only that axum
	// is alive, so the tick counter is what actually rules out a wedged sim.
	it('the sim thread is advancing', async () => {
		const before = JSON.parse(get('/stats')).tick;
		await sleep(1000);
		const after = JSON.parse(get('/stats')).tick;
		expect(after).toBeGreaterThan(before);
	});
});
