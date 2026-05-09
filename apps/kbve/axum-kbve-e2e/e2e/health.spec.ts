import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('Health endpoint', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('GET /health returns 200 with JSON', async () => {
		const res = await fetch(`${BASE_URL}/health`);
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body).toHaveProperty('status', 'ok');
		expect(body).toHaveProperty('version');
		expect(typeof body.version).toBe('string');
	});

	// Regression guard for the binary-vs-tag drift that bit prod on
	// 2026-05-08: a CI image was promoted (re-tagged) at publish time
	// without rebuilding, so the binary inside `kbve:1.0.138` reported
	// `1.0.137`. The Dockerfile now bakes `KBVE_VERSION` from a build-arg
	// and the kube Deployment can override at runtime — both paths must
	// keep `/health.version` in sync with the image tag.
	it('GET /health version matches KBVE_VERSION when set', async () => {
		const expected = process.env.KBVE_VERSION;
		if (!expected || expected === 'dev') {
			// Either not set or default placeholder — skip; the previous
			// test already asserts the field is a non-empty string.
			return;
		}
		const res = await fetch(`${BASE_URL}/health`);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.version).toBe(expected);
	});

	it('GET /health responds within 500ms', async () => {
		const start = Date.now();
		const res = await fetch(`${BASE_URL}/health`);
		const elapsed = Date.now() - start;

		expect(res.status).toBe(200);
		expect(elapsed).toBeLessThan(500);
	});

	it('GET /health.html returns 200 with HTML', async () => {
		const res = await fetch(`${BASE_URL}/health.html`);
		expect(res.status).toBe(200);

		const contentType = res.headers.get('content-type') ?? '';
		expect(contentType).toContain('text/html');

		const body = await res.text();
		expect(body).toContain('System Health');
		expect(body).toContain('Status');
	});
});
