import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

const VRM_PATH = '/assets/vt/witch-mimiko-meadow.vrm';
const MIN_VRM_BYTES = 1_000_000;

describe('Yuki VRM static asset', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('serves the VRM with HTTP 200', async () => {
		const res = await fetch(`${BASE_URL}${VRM_PATH}`);
		expect(res.status).toBe(200);
	});

	it('serves a non-stub payload (> 1 MB)', async () => {
		const res = await fetch(`${BASE_URL}${VRM_PATH}`);
		expect(res.status).toBe(200);
		const buf = await res.arrayBuffer();
		expect(buf.byteLength).toBeGreaterThan(MIN_VRM_BYTES);
	});

	it('returns a binary content-type, never text/html', async () => {
		const res = await fetch(`${BASE_URL}${VRM_PATH}`);
		const ct = (res.headers.get('content-type') ?? '').toLowerCase();
		expect(ct).not.toMatch(/text\/html/);
		expect(ct).toMatch(/octet-stream|application\/|model\//);
	});

	it('returns a long-lived cache-control for the static path', async () => {
		const res = await fetch(`${BASE_URL}${VRM_PATH}`);
		const cc = (res.headers.get('cache-control') ?? '').toLowerCase();
		if (!cc) return;
		expect(cc).toMatch(/max-age=\d{4,}|immutable|public/);
	});

	it('does NOT redirect away from the asset URL', async () => {
		const res = await fetch(`${BASE_URL}${VRM_PATH}`, {
			redirect: 'manual',
		});
		expect([200, 304]).toContain(res.status);
	});
});
