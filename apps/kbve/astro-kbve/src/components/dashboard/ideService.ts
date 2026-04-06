import { atom } from 'nanostores';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RunResult {
	vm_id: string;
	status: 'completed' | 'failed' | 'timeout';
	exit_code: number;
	stdout: string;
	stderr: string;
	duration_ms: number;
}

export type RunPhase = 'idle' | 'creating' | 'running' | 'completed' | 'failed';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FC_PROXY = '/dashboard/firecracker/proxy';
const POLL_INTERVAL_MS = 500;
const DEFAULT_TIMEOUT_MS = 15000;

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fcFetch<T>(
	token: string,
	path: string,
	method = 'GET',
	body?: unknown,
): Promise<T> {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${token}`,
	};
	const opts: RequestInit = {
		method,
		headers,
		signal: AbortSignal.timeout(20000),
	};
	if (body !== undefined) {
		headers['Content-Type'] = 'application/json';
		opts.body = JSON.stringify(body);
	}
	const resp = await fetch(`${FC_PROXY}${path}`, opts);
	if (!resp.ok) {
		const text = await resp.text().catch(() => '');
		throw new Error(
			`Firecracker API ${resp.status}: ${text.slice(0, 300)}`,
		);
	}
	const text = await resp.text();
	if (!text.trim()) return {} as T;
	return JSON.parse(text) as T;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class IDEService {
	public readonly $phase = atom<RunPhase>('idle');
	public readonly $result = atom<RunResult | null>(null);
	public readonly $error = atom<string | null>(null);
	public readonly $code = atom<string>(
		'# Write Python code here\nprint("Hello from Firecracker!")\n',
	);

	private _abortController: AbortController | null = null;

	public async run(token: string): Promise<void> {
		// Cancel any in-flight run
		this._abortController?.abort();
		this._abortController = new AbortController();

		const code = this.$code.get();
		if (!code.trim()) {
			this.$error.set('No code to run');
			return;
		}

		this.$phase.set('creating');
		this.$result.set(null);
		this.$error.set(null);

		try {
			// Create a VM that writes the code to a temp file and runs it
			const createResp = await fcFetch<{ vm_id: string; status: string }>(
				token,
				'/vm/create',
				'POST',
				{
					rootfs: 'alpine-python',
					vcpu_count: 1,
					mem_size_mib: 128,
					timeout_ms: DEFAULT_TIMEOUT_MS,
					entrypoint: '/usr/bin/python3',
					env: { PYTHON_CODE: code },
					boot_args: 'console=ttyS0 reboot=k panic=1',
				},
			);

			const vmId = createResp.vm_id;
			this.$phase.set('running');

			// Poll for result
			const deadline = Date.now() + DEFAULT_TIMEOUT_MS + 5000;
			while (Date.now() < deadline) {
				if (this._abortController.signal.aborted) return;

				const info = await fcFetch<{ vm_id: string; status: string }>(
					token,
					`/vm/${vmId}`,
				);

				if (
					info.status === 'completed' ||
					info.status === 'failed' ||
					info.status === 'timeout'
				) {
					const result = await fcFetch<RunResult>(
						token,
						`/vm/${vmId}/result`,
					);
					this.$result.set(result);
					this.$phase.set(
						result.status === 'completed' && result.exit_code === 0
							? 'completed'
							: 'failed',
					);
					return;
				}

				await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
			}

			// Timeout — try to get whatever result exists
			try {
				const result = await fcFetch<RunResult>(
					token,
					`/vm/${vmId}/result`,
				);
				this.$result.set(result);
			} catch {
				// ignore
			}
			this.$phase.set('failed');
			this.$error.set('Execution timed out');
		} catch (e) {
			this.$phase.set('failed');
			this.$error.set(e instanceof Error ? e.message : 'Unknown error');
		}
	}

	public cancel(): void {
		this._abortController?.abort();
		this._abortController = null;
		this.$phase.set('idle');
	}
}

export const ideService = new IDEService();
