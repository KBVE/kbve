import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('Health', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('should return 200 with service info', async () => {
		const res = await fetch(`${BASE_URL}/health`);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.status).toBe('ok');
		expect(body.service).toBe('firecracker-ctl');
		expect(body.version).toBeDefined();
		expect(body.timestamp).toBeDefined();
	});

	it('should report jailer mode in health response', async () => {
		const res = await fetch(`${BASE_URL}/health`);
		const body = await res.json();
		expect(typeof body.jailer).toBe('boolean');
	});
});
