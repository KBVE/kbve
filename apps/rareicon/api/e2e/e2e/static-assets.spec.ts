import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('Static asset serving', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('serves public RareIcon image assets with image content type', async () => {
		const res = await fetch(
			`${BASE_URL}/assets/icon/rareicon_low_res_256px.png`,
		);

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toContain('image/png');
		expect(res.headers.get('cache-control')).toContain('max-age=86400');

		const body = new Uint8Array(await res.arrayBuffer());
		expect(body.length).toBeGreaterThan(1024);
		expect(Array.from(body.slice(0, 8))).toEqual([
			0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
		]);
	});

	it('keeps generated API JSON available from the static dist', async () => {
		const res = await fetch(`${BASE_URL}/api/icons/python.json/`);

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toContain('application/json');

		const body = (await res.json()) as {
			ref: string;
			icons: Array<{ source: string; svg_body: string }>;
		};
		expect(body.ref).toBe('python');
		expect(body.icons.length).toBeGreaterThanOrEqual(2);
		expect(body.icons.every((icon) => icon.svg_body.includes('<svg'))).toBe(
			true,
		);
	});

	it('serves Astro 404 HTML for missing pages', async () => {
		const res = await fetch(`${BASE_URL}/missing-rareicon-page`);
		const body = await res.text();

		expect(res.status).toBe(404);
		expect(res.headers.get('content-type')).toContain('text/html');
		expect(body).toContain('RareIcon');
	});
});
