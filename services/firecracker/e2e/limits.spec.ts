import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
	BASE_URL,
	destroyVm,
	drainVms,
	sleepingVm,
	waitForFreeSlot,
	waitForReady,
	waitForStatus,
} from './helpers/http';

/**
 * The container runs with FC_MAX_CONCURRENT_VMS=5.
 *
 * This spec used to accept any of three outcomes -- a 429 somewhere, all 400,
 * or all 201 -- because the mock VMM exits in milliseconds, so slots freed
 * before the sixth request arrived and the cap could not be observed. The mock
 * now honours MOCK_SLEEP, so the VMs stay up and the cap is exact.
 */
const LIMIT = 5;

describe('Concurrency Limits', () => {
	const created: string[] = [];

	beforeAll(async () => {
		await waitForReady();
		// Another spec file may still be holding slots.
		await drainVms();
	});

	afterAll(async () => {
		await Promise.all(created.map((id) => destroyVm(id)));
	});

	it('admits exactly FC_MAX_CONCURRENT_VMS and rejects the next', async () => {
		// Serial, so each VM is holding its slot before the next is asked for.
		for (let i = 0; i < LIMIT; i++) {
			created.push(await sleepingVm(30));
		}
		await Promise.all(
			created.map((id) => waitForStatus(id, ['running', 'creating'], 10_000)),
		);

		const res = await fetch(`${BASE_URL}/vm/create`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				rootfs: 'alpine-minimal',
				entrypoint: '/bin/echo',
				timeout_ms: 5_000,
			}),
		});
		expect(res.status).toBe(429);

		const body = await res.json();
		expect(body.error).toContain('Too many concurrent VMs');
		expect(body.limit).toBe(LIMIT);
		expect(body.active).toBe(LIMIT);
	});

	it('frees the slot when a VM is destroyed', async () => {
		// Depends on the previous test having saturated the cap.
		const victim = created.pop()!;
		const del = await destroyVm(victim);
		expect(del.status).toBe(200);
		await waitForStatus(victim, ['destroyed'], 15_000);

		// One slot back, and only one: the replacement is admitted, and with
		// the cap full again the one after it is not.
		created.push(await waitForFreeSlot({ env: { CODE: 'MOCK_SLEEP=30' } }));
		const res = await fetch(`${BASE_URL}/vm/create`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				rootfs: 'alpine-minimal',
				entrypoint: '/bin/echo',
				timeout_ms: 5_000,
			}),
		});
		expect(res.status).toBe(429);
	});

	it('never admits more than the limit under a concurrent burst', async () => {
		// Drain first, then wait for capacity rather than for a label -- the
		// permit comes back when the lifecycle task finishes, which is after
		// DELETE has already relabelled the record.
		await Promise.all(created.map((id) => destroyVm(id)));
		created.length = 0;
		await destroyVm(await waitForFreeSlot());

		const burst = await Promise.all(
			Array.from({ length: LIMIT * 3 }, () =>
				fetch(`${BASE_URL}/vm/create`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						rootfs: 'alpine-minimal',
						entrypoint: '/bin/echo',
						timeout_ms: 40_000,
						env: { CODE: 'MOCK_SLEEP=30' },
					}),
				}),
			),
		);

		const statuses = burst.map((r) => r.status);
		expect(statuses.every((s) => s === 201 || s === 429)).toBe(true);

		// The invariant is the ceiling. How many of the five slots the drain
		// had actually handed back when the burst landed is timing, but going
		// over the cap never is -- that is the bug this guards.
		const admitted = statuses.filter((s) => s === 201).length;
		expect(admitted).toBeLessThanOrEqual(LIMIT);
		expect(admitted).toBeGreaterThan(0);
		expect(statuses.filter((s) => s === 429)).toHaveLength(
			statuses.length - admitted,
		);

		for (const res of burst) {
			if (res.status === 201) created.push((await res.json()).vm_id);
		}
	});
});
