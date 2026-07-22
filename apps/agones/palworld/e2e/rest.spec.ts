import { describe, it, expect } from 'vitest';

const HOST = process.env.PALWORLD_HOST ?? '127.0.0.1';
const REST = process.env.PALWORLD_REST ?? '8212';
const ADMIN = process.env.PALWORLD_ADMIN_PASSWORD ?? 'e2e-admin';
const base = `http://${HOST}:${REST}/v1/api`;
const auth = 'Basic ' + Buffer.from(`admin:${ADMIN}`).toString('base64');

describe('palworld REST', () => {
	it('serves /info', async () => {
		const res = await fetch(`${base}/info`, { headers: { Authorization: auth } });
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(typeof body.version).toBe('string');
		expect(typeof body.servername).toBe('string');
	});

	it('serves /metrics', async () => {
		const res = await fetch(`${base}/metrics`, { headers: { Authorization: auth } });
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(typeof body.currentplayernum).toBe('number');
	});
});
