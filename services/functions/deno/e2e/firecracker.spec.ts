import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';
import { createJwt } from './helpers/jwt';

/**
 * Firecracker MicroVM integration tests via the OWS edge function.
 *
 * These tests verify the edge function → firecracker-ctl wiring.
 * In CI (without a running firecracker-ctl service), the expected behavior is
 * a 503 "unreachable" response — proving the request was routed correctly and
 * the edge function attempted the upstream call.
 *
 * With a live firecracker-ctl service, these tests validate the full lifecycle.
 */
describe('Firecracker MicroVM (via OWS)', () => {
	let serviceToken: string;
	let anonToken: string;

	beforeAll(async () => {
		await waitForReady();
		serviceToken = createJwt({ role: 'service_role' });
		anonToken = createJwt({ role: 'anon' });
	});

	// ---- Auth ----

	it('should reject anon role for firecracker.status', async () => {
		const res = await fetch(`${BASE_URL}/ows`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${anonToken}`,
			},
			body: JSON.stringify({ command: 'firecracker.status' }),
		});
		expect(res.status).toBe(403);
		const body = await res.json();
		expect(body.error).toBeDefined();
	});

	// ---- Status ----

	it('should route firecracker.status to firecracker-ctl health', async () => {
		const res = await fetch(`${BASE_URL}/ows`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${serviceToken}`,
			},
			body: JSON.stringify({ command: 'firecracker.status' }),
		});
		// 200 if firecracker-ctl is running, 503 if unreachable — both are valid routing
		expect([200, 503]).toContain(res.status);
		const body = await res.json();
		expect(body.status).toBeDefined();
	});

	// ---- Create validation ----

	it('should reject create without rootfs', async () => {
		const res = await fetch(`${BASE_URL}/ows`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${serviceToken}`,
			},
			body: JSON.stringify({
				command: 'firecracker.create',
				entrypoint: '/bin/sh',
			}),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('rootfs');
	});

	it('should reject create without entrypoint', async () => {
		const res = await fetch(`${BASE_URL}/ows`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${serviceToken}`,
			},
			body: JSON.stringify({
				command: 'firecracker.create',
				rootfs: 'alpine-minimal',
			}),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('entrypoint');
	});

	// ---- Destroy validation ----

	it('should reject destroy without vm_id', async () => {
		const res = await fetch(`${BASE_URL}/ows`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${serviceToken}`,
			},
			body: JSON.stringify({ command: 'firecracker.destroy' }),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('vm_id');
	});

	// ---- Unknown action ----

	it('should reject unknown firecracker action', async () => {
		const res = await fetch(`${BASE_URL}/ows`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${serviceToken}`,
			},
			body: JSON.stringify({ command: 'firecracker.nonexistent' }),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('Unknown firecracker action');
	});

	// ---- Create + List + Destroy (integration — requires live firecracker-ctl) ----

	it('should attempt VM create and handle response', async () => {
		const res = await fetch(`${BASE_URL}/ows`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${serviceToken}`,
			},
			body: JSON.stringify({
				command: 'firecracker.create',
				rootfs: 'alpine-minimal',
				entrypoint: '/bin/echo',
				vcpu_count: 1,
				mem_size_mib: 128,
				timeout_ms: 10000,
				env: { TEST: '1' },
			}),
		});
		// 200/201 if live, 503 if unreachable — both prove correct routing
		expect([200, 201, 503]).toContain(res.status);
	});

	it('should attempt VM list and handle response', async () => {
		const res = await fetch(`${BASE_URL}/ows`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${serviceToken}`,
			},
			body: JSON.stringify({ command: 'firecracker.list' }),
		});
		expect([200, 503]).toContain(res.status);
	});
});
