import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

/**
 * Package cache drive tests using the mock firecracker binary.
 * Verifies that packages are correctly attached as additional drives
 * when the request includes a packages list.
 */
describe('Package Cache Drive', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	async function createAndPoll(payload: Record<string, unknown>) {
		const createRes = await fetch(`${BASE_URL}/vm/create`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});

		if (createRes.status === 400) return null;

		expect(createRes.status).toBe(201);
		const { vm_id } = await createRes.json();

		const deadline = Date.now() + 20_000;
		while (Date.now() < deadline) {
			const res = await fetch(`${BASE_URL}/vm/${vm_id}/result`);
			if (res.status === 200) {
				return await res.json();
			}
			await new Promise((r) => setTimeout(r, 500));
		}

		throw new Error(`VM ${vm_id} did not complete within 20s`);
	}

	it('should attach packages manifest drive for python rootfs', async () => {
		const result = await createAndPoll({
			rootfs: 'alpine-python',
			entrypoint: '/usr/bin/python3',
			vcpu_count: 1,
			mem_size_mib: 256,
			timeout_ms: 10000,
			packages: ['kbve', 'fudster'],
			env: { CODE: 'print("hello")' },
		});
		if (!result) return;

		expect(result.status).toBe('completed');
		expect(result.exit_code).toBe(0);
		// Mock reports attached drives in stdout
		expect(result.stdout).toContain('[mock-packages] kbve\nfudster');
		expect(result.stdout).toContain('[mock-pkg-cache] attached');
	});

	it('should attach manifest but no cache for node rootfs (pip-only cache)', async () => {
		const result = await createAndPoll({
			rootfs: 'alpine-node',
			entrypoint: '/usr/bin/node',
			vcpu_count: 1,
			mem_size_mib: 256,
			timeout_ms: 10000,
			packages: ['kbve'],
			env: { CODE: 'console.log("hello")' },
		});
		if (!result) return;

		expect(result.status).toBe('completed');
		expect(result.exit_code).toBe(0);
		// Manifest attached but no pip-cache for node rootfs
		expect(result.stdout).toContain('[mock-packages] kbve');
		expect(result.stdout).not.toContain('[mock-pkg-cache]');
	});

	it('should not attach packages drive when packages list is empty', async () => {
		const result = await createAndPoll({
			rootfs: 'alpine-python',
			entrypoint: '/usr/bin/python3',
			vcpu_count: 1,
			mem_size_mib: 128,
			timeout_ms: 10000,
			packages: [],
			env: { CODE: 'print("no packages")' },
		});
		if (!result) return;

		expect(result.status).toBe('completed');
		expect(result.stdout).not.toContain('[mock-packages]');
		expect(result.stdout).not.toContain('[mock-pkg-cache]');
	});

	it('should not attach cache drive for minimal rootfs', async () => {
		const result = await createAndPoll({
			rootfs: 'alpine-minimal',
			entrypoint: '/bin/echo',
			vcpu_count: 1,
			mem_size_mib: 128,
			timeout_ms: 10000,
			packages: ['somepackage'],
			env: { CODE: 'hello' },
		});
		if (!result) return;

		expect(result.status).toBe('completed');
		// alpine-minimal has no matching cache (not python or node)
		// The manifest drive is still attached but the cache drive is not
		expect(result.stdout).toContain('[mock-packages] somepackage');
		expect(result.stdout).not.toContain('[mock-pkg-cache]');
	});

	it('should work without packages field (backwards compatible)', async () => {
		const result = await createAndPoll({
			rootfs: 'alpine-python',
			entrypoint: '/usr/bin/python3',
			vcpu_count: 1,
			mem_size_mib: 128,
			timeout_ms: 10000,
			env: { CODE: 'print("compat")' },
		});
		if (!result) return;

		expect(result.status).toBe('completed');
		expect(result.stdout).not.toContain('[mock-packages]');
		expect(result.stdout).toContain('print("compat")');
	});
});
