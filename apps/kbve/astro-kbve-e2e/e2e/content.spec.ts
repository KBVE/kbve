import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('Content rendering', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('guides page contains heading', async () => {
		const res = await fetch(`${BASE_URL}/guides/getting-started/`);
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain('Getting Started');
	});

	it('application page contains main content', async () => {
		const res = await fetch(`${BASE_URL}/application/git/`);
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain('<main');
	});

	it('OSRS item page renders', async () => {
		const res = await fetch(`${BASE_URL}/osrs/3rd-age-amulet/`);
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain('<main');
	});

	it('journal entry renders', async () => {
		const res = await fetch(`${BASE_URL}/journal/01-01/`);
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain('<main');
	});

	it('HTML responses contain doctype', async () => {
		const res = await fetch(`${BASE_URL}/guides/`);
		const body = await res.text();
		expect(body.toLowerCase()).toContain('<!doctype html');
	});
});
