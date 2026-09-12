import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

/**
 * VM lifecycle tests. These require /dev/kvm to actually boot VMs.
 * In CI without KVM, create returns a spawn error — we verify the
 * status transitions are correct regardless.
 */
describe('VM Lifecycle', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('should accept a valid create request', async () => {
		const res = await fetch(`${BASE_URL}/vm/create`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				rootfs: 'alpine-minimal',
				entrypoint: '/bin/echo',
				vcpu_count: 1,
				mem_size_mib: 128,
				timeout_ms: 10000,
			}),
		});
		// 201 = accepted (VM may fail later without KVM, but the request was valid)
		// 400 = rootfs not found (no init job ran — still proves routing works)
		expect([201, 400]).toContain(res.status);

		if (res.status === 201) {
			const body = await res.json();
			expect(body.vm_id).toBeDefined();
			expect(body.vm_id).toMatch(/^fc-/);
			expect(body.status).toBe('creating');
			expect(body.rootfs).toBe('alpine-minimal');
			expect(body.vcpu_count).toBe(1);
			expect(body.mem_size_mib).toBe(128);
		}
	});

	it('should list VMs', async () => {
		const res = await fetch(`${BASE_URL}/vm`);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Array.isArray(body.vms)).toBe(true);
		expect(typeof body.count).toBe('number');
	});

	it('should create and poll VM result', async () => {
		const createRes = await fetch(`${BASE_URL}/vm/create`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				rootfs: 'alpine-minimal',
				entrypoint: '/bin/echo',
				vcpu_count: 1,
				mem_size_mib: 128,
				timeout_ms: 15000,
			}),
		});

		if (createRes.status !== 201) return; // no rootfs available, skip

		const { vm_id } = await createRes.json();

		// Poll for result — VM should complete or fail within timeout
		let resultBody: Record<string, unknown> | null = null;
		const deadline = Date.now() + 20_000;
		while (Date.now() < deadline) {
			const res = await fetch(`${BASE_URL}/vm/${vm_id}/result`);
			if (res.status === 200) {
				resultBody = await res.json();
				break;
			}
			await new Promise((r) => setTimeout(r, 1000));
		}

		expect(resultBody).not.toBeNull();
		expect(resultBody!.vm_id).toBe(vm_id);
		expect(resultBody!.duration_ms).toBeGreaterThan(0);
		// Without KVM the VM will fail; with KVM it should complete
		expect(['completed', 'failed']).toContain(resultBody!.status);
	});

	it('should create and destroy a VM', async () => {
		const createRes = await fetch(`${BASE_URL}/vm/create`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				rootfs: 'alpine-minimal',
				entrypoint: '/bin/sleep',
				vcpu_count: 1,
				mem_size_mib: 128,
				timeout_ms: 30000,
			}),
		});

		if (createRes.status !== 201) return;

		const { vm_id } = await createRes.json();

		const destroyRes = await fetch(`${BASE_URL}/vm/${vm_id}`, {
			method: 'DELETE',
		});
		expect(destroyRes.status).toBe(200);
		const body = await destroyRes.json();
		expect(body.status).toBe('destroyed');

		// Status should reflect destruction
		const statusRes = await fetch(`${BASE_URL}/vm/${vm_id}`);
		expect(statusRes.status).toBe(200);
		const statusBody = await statusRes.json();
		expect(statusBody.status).toBe('destroyed');
	});
});
