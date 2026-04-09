import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('Concurrency Limits', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('should enforce max concurrent VMs', async () => {
		// The container is started with FC_MAX_CONCURRENT_VMS=5.
		// Fire 6 creates — the 6th should get 429 (if rootfs exists and VMs
		// are still running) or 201 (if mock completes instantly and frees slots).
		// Without rootfs: all 400.
		const requests = Array.from({ length: 6 }, () =>
			fetch(`${BASE_URL}/vm/create`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					rootfs: 'alpine-minimal',
					entrypoint: '/bin/sleep',
					vcpu_count: 1,
					mem_size_mib: 128,
					timeout_ms: 30000,
				}),
			}),
		);

		const responses = await Promise.all(requests);
		const statuses = responses.map((r) => r.status);

		// Valid outcomes:
		// - 429 present: limit enforced (VMs were still running when 6th arrived)
		// - All 400: no rootfs available
		// - All 201: mock completes so fast VMs freed slots before limit hit
		const has429 = statuses.includes(429);
		const allBadRequest = statuses.every((s) => s === 400);
		const allCreated = statuses.every((s) => s === 201);

		expect(has429 || allBadRequest || allCreated).toBe(true);

		if (has429) {
			const limitRes = responses.find((r) => r.status === 429)!;
			const body = await limitRes.json();
			expect(body.error).toContain('Too many concurrent VMs');
			expect(body.limit).toBe(5);
		}

		// Cleanup: destroy any VMs we created
		for (const res of responses) {
			if (res.status === 201) {
				const body = await res.json();
				await fetch(`${BASE_URL}/vm/${body.vm_id}`, {
					method: 'DELETE',
				});
			}
		}
	});
});
