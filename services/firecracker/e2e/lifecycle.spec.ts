import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import {
	BASE_URL,
	createVm,
	destroyVm,
	drainVms,
	pollResult,
	sleepingVm,
	waitForReady,
	waitForStatus,
} from './helpers/http';

/**
 * VM lifecycle against the mock VMM.
 *
 * These used to hedge -- `expect([201, 400]).toContain(status)` and an early
 * `return` when create did not come back 201 -- on the theory that the rootfs
 * might be missing. It cannot be: the mock image bakes alpine-minimal,
 * alpine-node, alpine-python and pip-cache into the rootfs directory, so a 400
 * there is a real failure and the hedge was hiding it. Everything below
 * asserts the contract outright.
 */
describe('VM Lifecycle', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	// Several tests here deliberately leave a VM dwelling; the concurrency cap
	// is global, so anything still running would surface as a 429 in the next
	// spec file rather than here.
	afterAll(async () => {
		await drainVms();
	});

	it('accepts a valid create and echoes the request back', async () => {
		const res = await fetch(`${BASE_URL}/vm/create`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				rootfs: 'alpine-minimal',
				entrypoint: '/bin/echo',
				vcpu_count: 1,
				mem_size_mib: 128,
				timeout_ms: 10_000,
			}),
		});
		expect(res.status).toBe(201);

		const body = await res.json();
		expect(body.vm_id).toMatch(/^fc-[0-9a-f]{32}$/);
		expect(body.status).toBe('creating');
		expect(body.rootfs).toBe('alpine-minimal');
		expect(body.vcpu_count).toBe(1);
		expect(body.mem_size_mib).toBe(128);
		expect(Date.parse(body.created_at)).not.toBeNaN();

		await destroyVm(body.vm_id);
	});

	it('lists VMs it has created', async () => {
		const vmId = await createVm();

		const res = await fetch(`${BASE_URL}/vm`);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Array.isArray(body.vms)).toBe(true);
		expect(body.count).toBe(body.vms.length);
		expect(body.vms.map((v: { vm_id: string }) => v.vm_id)).toContain(vmId);
	});

	it('runs to completion and reports the guest exit code and stdout', async () => {
		const vmId = await createVm({ env: { CODE: 'lifecycle-marker-9f31' } });
		const result = await pollResult(vmId);

		// The mock always exits 0, so anything else is firecracker-ctl
		// misreporting rather than a guest failure.
		expect(result.status).toBe('completed');
		expect(result.exit_code).toBe(0);
		expect(result.vm_id).toBe(vmId);
		expect(result.stdout).toContain('lifecycle-marker-9f31');
		expect(result.stderr).toBe('');
		expect(result.duration_ms).toBeGreaterThan(0);
	});

	it('destroys a VM that is still running', async () => {
		// Without the dwell the mock exits in milliseconds, so this raced the
		// VM to completion and asserted 'destroyed' against whichever won.
		const vmId = await sleepingVm(20);
		expect(await waitForStatus(vmId, ['running', 'creating'], 10_000)).toBeTruthy();

		const res = await destroyVm(vmId);
		expect(res.status).toBe(200);
		expect((await res.json()).status).toBe('destroyed');

		// The kill signal has to actually stop the VMM, not just relabel the
		// record: the lifecycle task writes a result only once the child is
		// reaped, and VmOutcome::Killed is the only path that produces this one.
		const result = await pollResult(vmId, 15_000);
		expect(result.status).toBe('destroyed');
		expect(result.stderr).toBe('VM destroyed by user');
		// Well inside the 20s dwell -- proof the process was killed, not waited out.
		expect(result.duration_ms).toBeLessThan(15_000);
	});

	it('enforces timeout_ms on a VM that outlives it', async () => {
		// Dwell far past the timeout: firecracker-ctl owns the deadline, the
		// guest does not.
		const vmId = await createVm({
			timeout_ms: 2_000,
			env: { CODE: 'MOCK_SLEEP=60' },
		});
		const result = await pollResult(vmId, 30_000);
		expect(result.status).toBe('timeout');
		expect(result.stderr).toBe('VM timed out after 2000ms');
		// The VMM is killed at the deadline rather than left to finish its
		// 60s dwell as an orphan.
		expect(result.duration_ms).toBeLessThan(30_000);
	});

	it('returns 404 for a VM it never created', async () => {
		for (const path of ['/vm/fc-nonexistent', '/vm/fc-nonexistent/result']) {
			const res = await fetch(`${BASE_URL}${path}`);
			expect(res.status).toBe(404);
		}
		const del = await destroyVm('fc-nonexistent');
		expect(del.status).toBe(404);
	});
});
