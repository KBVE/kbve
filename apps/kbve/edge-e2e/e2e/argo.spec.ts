import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';
import { createJwt } from './helpers/jwt';

describe('Argo — Smoke Tests', () => {
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
		const res = await fetch(`${BASE_URL}/argo`, { method: 'OPTIONS' });
		expect(res.status).toBe(200);
		expect(res.headers.get('access-control-allow-origin')).toBe('*');
	});

	// -- Method --

	it('should return 405 for GET requests', async () => {
		const res = await fetch(`${BASE_URL}/argo`, {
			method: 'GET',
			headers: { Authorization: `Bearer ${serviceToken}` },
		});
		expect(res.status).toBe(405);
		const body = await res.json();
		expect(body.error).toContain('Only POST method is allowed');
	});

	// -- Auth --

	it('should return 401 when no auth header is provided', async () => {
		const res = await fetch(`${BASE_URL}/argo`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ command: 'health' }),
		});
		expect(res.status).toBe(401);
	});

	it('should return 403 for anon role (staff gate)', async () => {
		const anonToken = createJwt({ role: 'anon' });
		const res = await fetch(`${BASE_URL}/argo`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${anonToken}`,
			},
			body: JSON.stringify({ command: 'health' }),
		});
		expect(res.status).toBe(403);
	});

	it('should return 403 for authenticated role (staff gate)', async () => {
		const authToken = createJwt({ role: 'authenticated' });
		const res = await fetch(`${BASE_URL}/argo`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${authToken}`,
			},
			body: JSON.stringify({ command: 'health' }),
		});
		expect(res.status).toBe(403);
	});

	// -- Service role reaches argo (503 = no ArgoCD upstream configured in e2e) --

	it('should allow service_role past staff gate and reach argo', async () => {
		const res = await fetch(`${BASE_URL}/argo`, {
			method: 'POST',
			headers: headers(),
			body: JSON.stringify({ command: 'health' }),
		});
		// 503 means argo booted but ARGOCD_UPSTREAM_URL is not set — auth passed
		expect(res.status).toBe(503);
		const body = await res.json();
		expect(body.error).toContain('Service unavailable');
	});

	it('should return 503 for applications command (no upstream)', async () => {
		const res = await fetch(`${BASE_URL}/argo`, {
			method: 'POST',
			headers: headers(),
			body: JSON.stringify({ command: 'applications' }),
		});
		expect(res.status).toBe(503);
	});

	it('should return 503 for app-status command (no upstream)', async () => {
		const res = await fetch(`${BASE_URL}/argo`, {
			method: 'POST',
			headers: headers(),
			body: JSON.stringify({ command: 'app-status', name: 'test-app' }),
		});
		expect(res.status).toBe(503);
	});
});
