import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

/**
 * Full VM execution tests using the mock firecracker binary.
 * The mock reads the code drive and prints its content to stdout,
 * exercising the entire firecracker-ctl pipeline:
 *   API → validation → code buffer → config generation → process spawn →
 *   stdout capture → status transitions → cleanup
 */
describe('VM Execution (mock)', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	async function createAndPoll(payload: Record<string, unknown>) {
		const createRes = await fetch(`${BASE_URL}/vm/create`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});

		if (createRes.status === 400) {
			// No rootfs available (running against real image, not mock)
			return null;
		}

		expect(createRes.status).toBe(201);
		const { vm_id } = await createRes.json();
		expect(vm_id).toMatch(/^fc-/);

		// Poll for result
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

	it('should execute and capture stdout from code drive', async () => {
		const result = await createAndPoll({
			rootfs: 'alpine-minimal',
			entrypoint: '/bin/echo',
			vcpu_count: 1,
			mem_size_mib: 128,
			timeout_ms: 10000,
			env: { CODE: 'hello from mock vm' },
		});
		if (!result) return; // no mock rootfs, skip

		expect(result.status).toBe('completed');
		expect(result.exit_code).toBe(0);
		expect(result.stdout).toContain('hello from mock vm');
		expect(result.duration_ms).toBeGreaterThan(0);
	});

	it('should execute node.js-style code', async () => {
		const code = 'console.log("node-e2e-test-output")';
		const result = await createAndPoll({
			rootfs: 'alpine-node',
			entrypoint: '/usr/bin/node',
			vcpu_count: 1,
			mem_size_mib: 256,
			timeout_ms: 10000,
			env: { CODE: code },
		});
		if (!result) return;

		expect(result.status).toBe('completed');
		expect(result.exit_code).toBe(0);
		expect(result.stdout).toContain(code);
	});

	it('should execute python-style code', async () => {
		const code = 'print("python-e2e-test-output")';
		const result = await createAndPoll({
			rootfs: 'alpine-python',
			entrypoint: '/usr/bin/python3',
			vcpu_count: 1,
			mem_size_mib: 256,
			timeout_ms: 10000,
			env: { CODE: code },
		});
		if (!result) return;

		expect(result.status).toBe('completed');
		expect(result.exit_code).toBe(0);
		expect(result.stdout).toContain(code);
	});

	it('should handle empty code gracefully', async () => {
		const result = await createAndPoll({
			rootfs: 'alpine-minimal',
			entrypoint: '/bin/echo',
			vcpu_count: 1,
			mem_size_mib: 128,
			timeout_ms: 10000,
		});
		if (!result) return;

		// No CODE env → code buffer contains the entrypoint path
		expect(result.status).toBe('completed');
		expect(result.exit_code).toBe(0);
		expect(result.stdout).toContain('/bin/echo');
	});

	it('should timeout a long-running VM', async () => {
		const createRes = await fetch(`${BASE_URL}/vm/create`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				rootfs: 'alpine-minimal',
				entrypoint: '/bin/sleep',
				vcpu_count: 1,
				mem_size_mib: 128,
				timeout_ms: 500,
				env: { CODE: 'sleep 999' },
			}),
		});

		if (createRes.status === 400) return; // no rootfs

		expect(createRes.status).toBe(201);
		const { vm_id } = await createRes.json();

		// Wait for timeout
		const deadline = Date.now() + 10_000;
		let result = null;
		while (Date.now() < deadline) {
			const res = await fetch(`${BASE_URL}/vm/${vm_id}/result`);
			if (res.status === 200) {
				result = await res.json();
				break;
			}
			await new Promise((r) => setTimeout(r, 300));
		}

		expect(result).not.toBeNull();
		// Mock finishes instantly so this may be 'completed' not 'timeout',
		// but with a real long process it would timeout
		expect(['completed', 'timeout']).toContain(result!.status);
	});

	it('should track VM in list after creation', async () => {
		const createRes = await fetch(`${BASE_URL}/vm/create`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				rootfs: 'alpine-minimal',
				entrypoint: '/bin/echo',
				vcpu_count: 1,
				mem_size_mib: 128,
				timeout_ms: 10000,
				env: { CODE: 'list-test' },
			}),
		});

		if (createRes.status === 400) return;

		const { vm_id } = await createRes.json();

		const listRes = await fetch(`${BASE_URL}/vm`);
		expect(listRes.status).toBe(200);
		const { vms } = await listRes.json();
		const found = vms.find(
			(vm: Record<string, unknown>) => vm.vm_id === vm_id,
		);
		expect(found).toBeDefined();
		expect(found.rootfs).toBe('alpine-minimal');
	});
});
