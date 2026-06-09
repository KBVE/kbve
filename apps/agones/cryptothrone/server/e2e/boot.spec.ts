import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { dockerRunning } from './helpers/docker';

const host = process.env.CT_HOST ?? '127.0.0.1';
const port = process.env.CT_PORT ?? '7979';

describe('cryptothrone-server boot smoke', () => {
	it('container is still running', () => {
		expect(dockerRunning()).toBe(true);
	});

	it('healthz returns ok', () => {
		const out = execSync(`curl -fsS http://${host}:${port}/healthz`, {
			encoding: 'utf8',
		}).trim();
		expect(out).toBe('ok');
	});
});
