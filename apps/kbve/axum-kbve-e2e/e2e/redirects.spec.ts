import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('Redirect routes', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('GET /application/kube redirects to /application/kubernetes/', async () => {
		const res = await fetch(`${BASE_URL}/application/kube`, {
			redirect: 'manual',
		});
		expect([301, 302, 307, 308]).toContain(res.status);
		const location = res.headers.get('location') ?? '';
		expect(location).toContain('/application/kubernetes');
	});

	it('GET /application/kubectl redirects to /application/kubernetes/', async () => {
		const res = await fetch(`${BASE_URL}/application/kubectl`, {
			redirect: 'manual',
		});
		expect([301, 302, 307, 308]).toContain(res.status);
		const location = res.headers.get('location') ?? '';
		expect(location).toContain('/application/kubernetes');
	});

	it('redirect targets resolve to 200', async () => {
		const res = await fetch(`${BASE_URL}/application/kubernetes/`);
		expect(res.status).toBe(200);
		const ct = res.headers.get('content-type') ?? '';
		expect(ct).toContain('text/html');
	});
});
