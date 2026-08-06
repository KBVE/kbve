import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { dockerLogs, dockerRunning } from './helpers/docker';

const host = process.env.HM_HOST ?? '127.0.0.1';
const port = process.env.HM_PORT ?? '7979';

describe('herbmail-server boot smoke', () => {
	it('container is still running', () => {
		expect(dockerRunning()).toBe(true);
	});

	it('healthz returns ok', () => {
		const out = execSync(`curl -fsS http://${host}:${port}/healthz`, {
			encoding: 'utf8',
		}).trim();
		expect(out).toBe('ok');
	});

	it('admits guests when no Supabase JWKS is configured', () => {
		expect(dockerLogs()).toContain('guests only (no JWKS configured)');
	});

	it('reports that collision is not yet authoritative', () => {
		expect(dockerLogs()).toContain('authoritative_collision=false');
	});
});
