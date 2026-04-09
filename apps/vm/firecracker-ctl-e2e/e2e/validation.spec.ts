import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('Input Validation', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('should reject create with missing rootfs', async () => {
		const res = await fetch(`${BASE_URL}/vm/create`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				entrypoint: '/bin/echo',
				vcpu_count: 1,
				mem_size_mib: 128,
			}),
		});
		// Axum returns 422 for missing required fields (serde deserialization)
		expect(res.status).toBe(422);
	});

	it('should reject create with nonexistent rootfs', async () => {
		const res = await fetch(`${BASE_URL}/vm/create`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				rootfs: 'does-not-exist',
				entrypoint: '/bin/echo',
			}),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('not found');
	});

	it('should reject create with relative entrypoint path', async () => {
		const res = await fetch(`${BASE_URL}/vm/create`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				rootfs: 'alpine-minimal',
				entrypoint: 'bin/echo',
			}),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('absolute path');
	});

	it('should reject create with shell metacharacters in entrypoint', async () => {
		const res = await fetch(`${BASE_URL}/vm/create`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				rootfs: 'alpine-minimal',
				entrypoint: '/bin/echo; rm -rf /',
			}),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('special characters');
	});

	it('should reject create with empty entrypoint', async () => {
		const res = await fetch(`${BASE_URL}/vm/create`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				rootfs: 'alpine-minimal',
				entrypoint: '',
			}),
		});
		expect(res.status).toBe(400);
	});

	it('should return 404 for nonexistent VM status', async () => {
		const res = await fetch(`${BASE_URL}/vm/fc-nonexistent`);
		expect(res.status).toBe(404);
	});

	it('should return 404 for nonexistent VM result', async () => {
		const res = await fetch(`${BASE_URL}/vm/fc-nonexistent/result`);
		expect(res.status).toBe(404);
	});

	it('should return 404 for nonexistent VM destroy', async () => {
		const res = await fetch(`${BASE_URL}/vm/fc-nonexistent`, {
			method: 'DELETE',
		});
		expect(res.status).toBe(404);
	});
});
