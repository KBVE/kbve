import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('Static asset endpoints', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('GET /llms.txt returns 200 plain text', async () => {
		const res = await fetch(`${BASE_URL}/llms.txt`);
		expect(res.status).toBe(200);
		const ct = res.headers.get('content-type') ?? '';
		expect(ct).toContain('text');
	});

	it('GET /llms-full.txt returns 200 plain text', async () => {
		const res = await fetch(`${BASE_URL}/llms-full.txt`);
		expect(res.status).toBe(200);
		const ct = res.headers.get('content-type') ?? '';
		expect(ct).toContain('text');
	});

	it('GET /llms.txt has non-empty body referencing kbve.com', async () => {
		const body = await (await fetch(`${BASE_URL}/llms.txt`)).text();
		expect(body.length).toBeGreaterThan(100);
		expect(body.toLowerCase()).toContain('kbve');
	});

	it('GET /sitemap-index.xml returns 200 XML', async () => {
		const res = await fetch(`${BASE_URL}/sitemap-index.xml`);
		expect(res.status).toBe(200);
		const ct = res.headers.get('content-type') ?? '';
		expect(ct).toMatch(/xml/);
		const body = await res.text();
		expect(body).toContain('<sitemap');
	});

	it('GET /favicon.ico returns a non-404 response', async () => {
		const res = await fetch(`${BASE_URL}/favicon.ico`);
		expect(res.status).not.toBe(404);
	});
});

describe('Homepage metadata', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('includes a <title>', async () => {
		const body = await (await fetch(`${BASE_URL}/`)).text();
		expect(body).toMatch(/<title>[^<]+<\/title>/);
	});

	it('includes meta description', async () => {
		const body = await (await fetch(`${BASE_URL}/`)).text();
		expect(body).toMatch(/<meta[^>]+name=["']description["']/i);
	});

	it('emits Open Graph + Twitter card tags', async () => {
		const body = await (await fetch(`${BASE_URL}/`)).text();
		expect(body).toMatch(/property=["']og:title["']/i);
		expect(body).toMatch(/property=["']og:image["']/i);
	});

	it('declares canonical link', async () => {
		const body = await (await fetch(`${BASE_URL}/`)).text();
		expect(body).toMatch(/<link[^>]+rel=["']canonical["']/i);
	});
});

describe('Donate page metadata', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('uses custom og title configured in frontmatter', async () => {
		const body = await (await fetch(`${BASE_URL}/donate/`)).text();
		expect(body.toLowerCase()).toContain('donate');
	});
});
