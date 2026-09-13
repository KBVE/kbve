const FC_HOST = process.env['FC_HOST'] ?? '127.0.0.1';
const FC_PORT = Number(process.env['FC_PORT'] ?? 19001);

export const BASE_URL = `http://${FC_HOST}:${FC_PORT}`;

/**
 * Poll until firecracker-ctl responds to HTTP requests.
 * TCP-only checks are insufficient — the server accepts TCP
 * connections before the HTTP handler is fully initialized.
 */
export async function waitForReady(timeoutMs = 60_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${BASE_URL}/health`, {
				signal: AbortSignal.timeout(2_000),
			});
			if (res.status > 0) return;
		} catch {
			// Connection refused or reset — keep trying
		}
		await new Promise((r) => setTimeout(r, 500));
	}

	throw new Error(
		`firecracker-ctl server not ready at ${BASE_URL} after ${timeoutMs}ms`,
	);
}

export interface CreateVmOptions {
	rootfs?: string;
	entrypoint?: string;
	vcpu_count?: number;
	mem_size_mib?: number;
	timeout_ms?: number;
	env?: Record<string, unknown>;
	packages?: string[];
}

/**
 * POST /vm/create. The mock image bakes alpine-minimal, alpine-node,
 * alpine-python and pip-cache into /var/lib/firecracker/rootfs, so a create
 * against one of those is expected to be accepted -- a non-201 is a failure,
 * not a reason for the caller to skip itself.
 */
export async function createVm(opts: CreateVmOptions = {}): Promise<string> {
	const res = await fetch(`${BASE_URL}/vm/create`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			rootfs: 'alpine-minimal',
			entrypoint: '/bin/echo',
			vcpu_count: 1,
			mem_size_mib: 128,
			timeout_ms: 15_000,
			...opts,
		}),
	});
	if (res.status !== 201) {
		throw new Error(
			`create failed: ${res.status} ${await res.text()}`,
		);
	}
	const body = await res.json();
	return body.vm_id as string;
}

/**
 * Ask the mock VMM to stay up for `seconds` before exiting. The dwell is
 * carried in the code drive, which is the only channel the mock reads.
 */
export function sleepingVm(seconds: number, opts: CreateVmOptions = {}) {
	return createVm({
		timeout_ms: (seconds + 30) * 1000,
		...opts,
		env: { CODE: `MOCK_SLEEP=${seconds}`, ...(opts.env ?? {}) },
	});
}

/** Poll GET /vm/{id}/result until it leaves 202. */
export async function pollResult(
	vmId: string,
	timeoutMs = 30_000,
): Promise<Record<string, unknown>> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const res = await fetch(`${BASE_URL}/vm/${vmId}/result`);
		if (res.status === 200) return await res.json();
		await new Promise((r) => setTimeout(r, 200));
	}
	throw new Error(`VM ${vmId} produced no result within ${timeoutMs}ms`);
}

/** Poll GET /vm/{id} until its status is one of `wanted`. */
export async function waitForStatus(
	vmId: string,
	wanted: string[],
	timeoutMs = 30_000,
): Promise<string> {
	const deadline = Date.now() + timeoutMs;
	let last = 'unknown';
	while (Date.now() < deadline) {
		const res = await fetch(`${BASE_URL}/vm/${vmId}`);
		if (res.status === 200) {
			last = (await res.json()).status;
			if (wanted.includes(last)) return last;
		}
		await new Promise((r) => setTimeout(r, 200));
	}
	throw new Error(
		`VM ${vmId} stayed in '${last}', never reached ${wanted.join('|')}`,
	);
}

export async function destroyVm(vmId: string): Promise<Response> {
	return await fetch(`${BASE_URL}/vm/${vmId}`, { method: 'DELETE' });
}

/**
 * Poll /vm/create until it is admitted, and return the id.
 *
 * A concurrency slot is a permit held by the lifecycle task, released when
 * that task finishes cleaning up -- which is strictly after DELETE has
 * relabelled the record as destroyed. So "the VM says destroyed" is not the
 * same instant as "the slot is free", and a test that wants free capacity has
 * to ask for capacity rather than watch a status.
 */
export async function waitForFreeSlot(
	opts: CreateVmOptions = {},
	timeoutMs = 30_000,
): Promise<string> {
	const deadline = Date.now() + timeoutMs;
	let last = 0;
	while (Date.now() < deadline) {
		const res = await fetch(`${BASE_URL}/vm/create`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				rootfs: 'alpine-minimal',
				entrypoint: '/bin/echo',
				timeout_ms: 10_000,
				...opts,
			}),
		});
		if (res.status === 201) return (await res.json()).vm_id as string;
		last = res.status;
		await new Promise((r) => setTimeout(r, 200));
	}
	throw new Error(`no concurrency slot freed within ${timeoutMs}ms (last ${last})`);
}

/**
 * Destroy every VM the server still considers active and wait until a slot is
 * actually free again.
 *
 * The concurrency cap is global to the server, so one spec file leaving a
 * long-dwelling VM behind shows up as a 429 in the next one. Specs that care
 * about capacity start from a known-empty server.
 */
export async function drainVms(): Promise<void> {
	const res = await fetch(`${BASE_URL}/vm`);
	const { vms } = await res.json();
	await Promise.all(
		(vms as Array<{ vm_id: string; status: string }>)
			.filter((v) => v.status === 'creating' || v.status === 'running')
			.map((v) => destroyVm(v.vm_id)),
	);
	await destroyVm(await waitForFreeSlot());
}
