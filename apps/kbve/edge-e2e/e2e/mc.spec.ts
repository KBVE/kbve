import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';
import { createJwt } from './helpers/jwt';

describe('MC — Smoke Tests', () => {
	let serviceToken: string;

	beforeAll(async () => {
		await waitForReady();
		serviceToken = createJwt({ role: 'service_role' });
	});

	const headers = () => ({
		'Content-Type': 'application/json',
		Authorization: `Bearer ${serviceToken}`,
	});

	// -- CORS --

	it('should return 200 for OPTIONS preflight without JWT', async () => {
		const res = await fetch(`${BASE_URL}/mc`, { method: 'OPTIONS' });
		expect(res.status).toBe(200);
		expect(res.headers.get('access-control-allow-origin')).toBe('*');
	});

	// -- Method --

	it('should return 405 for GET requests', async () => {
		const res = await fetch(`${BASE_URL}/mc`, {
			method: 'GET',
			headers: { Authorization: `Bearer ${serviceToken}` },
		});
		expect(res.status).toBe(405);
		const body = await res.json();
		expect(body.error).toContain('Only POST method is allowed');
	});

	// -- Auth --

	it('should return 401 when no auth header is provided', async () => {
		const res = await fetch(`${BASE_URL}/mc`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ command: 'auth.status' }),
		});
		expect(res.status).toBe(401);
	});

	// -- Command routing --

	it('should return 400 when command is missing', async () => {
		const res = await fetch(`${BASE_URL}/mc`, {
			method: 'POST',
			headers: headers(),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('command is required');
	});

	it('should return 400 for bad command format (no dot)', async () => {
		const res = await fetch(`${BASE_URL}/mc`, {
			method: 'POST',
			headers: headers(),
			body: JSON.stringify({ command: 'status' }),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('module.action');
	});

	it('should return 400 for unknown module', async () => {
		const res = await fetch(`${BASE_URL}/mc`, {
			method: 'POST',
			headers: headers(),
			body: JSON.stringify({ command: 'unknown.action' }),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('Unknown module');
	});

	it('should list available modules in unknown module error', async () => {
		const res = await fetch(`${BASE_URL}/mc`, {
			method: 'POST',
			headers: headers(),
			body: JSON.stringify({ command: 'fake.action' }),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('auth');
		expect(body.error).toContain('player');
		expect(body.error).toContain('container');
		expect(body.error).toContain('transfer');
		expect(body.error).toContain('character');
		expect(body.error).toContain('skill');
	});

	it('should return 500 for malformed JSON body', async () => {
		const res = await fetch(`${BASE_URL}/mc`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${serviceToken}`,
			},
			body: '{not valid json',
		});
		expect(res.status).toBe(500);
	});

	// -- Valid command reaches handler (no 400/401 from router) --

	it('should route auth.status past the router', async () => {
		const res = await fetch(`${BASE_URL}/mc`, {
			method: 'POST',
			headers: headers(),
			body: JSON.stringify({ command: 'auth.status' }),
		});
		// Not 401 (auth passed) or 405 (method accepted); handler-level 400/500 is fine
		expect(res.status).not.toBe(401);
		expect(res.status).not.toBe(405);
	});

	it('should route player.load past the router', async () => {
		const res = await fetch(`${BASE_URL}/mc`, {
			method: 'POST',
			headers: headers(),
			body: JSON.stringify({ command: 'player.load' }),
		});
		expect(res.status).not.toBe(401);
		expect(res.status).not.toBe(405);
	});
});
