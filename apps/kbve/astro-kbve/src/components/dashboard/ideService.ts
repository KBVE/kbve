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

export interface HistoryEntry {
	id: string;
	preset_id: string;
	code: string;
	result: RunResult | null;
	error: string | null;
	timestamp: number;
}

export interface RuntimePreset {
	id: string;
	label: string;
	description: string;
	rootfs: string;
	language: string;
	vcpu_count: number;
	mem_size_mib: number;
	timeout_ms: number;
	entrypoint: string;
}

// ---------------------------------------------------------------------------
// Preset inventory
// ---------------------------------------------------------------------------

export const PRESETS: RuntimePreset[] = [
	{
		id: 'python-quick',
		label: 'Python Quick',
		description: '15s · 128 MiB · Fast scripts',
		rootfs: 'alpine-python',
		language: 'python',
		vcpu_count: 1,
		mem_size_mib: 128,
		timeout_ms: 15_000,
		entrypoint: '/usr/bin/python3',
	},
	{
		id: 'python-standard',
		label: 'Python Standard',
		description: '60s · 256 MiB · General purpose',
		rootfs: 'alpine-python',
		language: 'python',
		vcpu_count: 1,
		mem_size_mib: 256,
		timeout_ms: 60_000,
		entrypoint: '/usr/bin/python3',
	},
	{
		id: 'python-heavy',
		label: 'Python Heavy',
		description: '120s · 512 MiB · Data processing',
		rootfs: 'alpine-python',
		language: 'python',
		vcpu_count: 2,
		mem_size_mib: 512,
		timeout_ms: 120_000,
		entrypoint: '/usr/bin/python3',
	},
	{
		id: 'node-quick',
		label: 'Node.js Quick',
		description: '15s · 128 MiB · Fast scripts',
		rootfs: 'alpine-node',
		language: 'javascript',
		vcpu_count: 1,
		mem_size_mib: 128,
		timeout_ms: 15_000,
		entrypoint: '/usr/bin/node',
	},
	{
		id: 'node-standard',
		label: 'Node.js Standard',
		description: '60s · 256 MiB · General purpose',
		rootfs: 'alpine-node',
		language: 'javascript',
		vcpu_count: 1,
		mem_size_mib: 256,
		timeout_ms: 60_000,
		entrypoint: '/usr/bin/node',
	},
	{
		id: 'shell-minimal',
		label: 'Shell',
		description: '30s · 64 MiB · Busybox shell',
		rootfs: 'alpine-minimal',
		language: 'shell',
		vcpu_count: 1,
		mem_size_mib: 64,
		timeout_ms: 30_000,
		entrypoint: '/bin/sh',
	},
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FC_PROXY = '/dashboard/firecracker/proxy';
const POLL_INTERVAL_MS = 500;

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

const DEFAULT_CODES: Record<string, string> = {
	python: '# Write Python code here\nprint("Hello from Firecracker!")\n',
	javascript:
		'// Write JavaScript code here\nconsole.log("Hello from Firecracker!");\n',
	shell: '#!/bin/sh\necho "Hello from Firecracker!"\n',
};

const MAX_HISTORY = 20;

class IDEService {
	public readonly $phase = atom<RunPhase>('idle');
	public readonly $result = atom<RunResult | null>(null);
	public readonly $error = atom<string | null>(null);
	public readonly $preset = atom<RuntimePreset>(PRESETS[0]);
	public readonly $code = atom<string>(DEFAULT_CODES.python);
	public readonly $history = atom<HistoryEntry[]>([]);

	private _abortController: AbortController | null = null;

	private _pushHistory(result: RunResult | null, error: string | null): void {
		const entry: HistoryEntry = {
			id: result?.vm_id ?? `err-${Date.now()}`,
			preset_id: this.$preset.get().id,
			code: this.$code.get(),
			result,
			error,
			timestamp: Date.now(),
		};
		const prev = this.$history.get();
		this.$history.set([entry, ...prev].slice(0, MAX_HISTORY));
	}

	public selectPreset(presetId: string): void {
		const preset = PRESETS.find((p) => p.id === presetId);
		if (!preset) return;
		this.$preset.set(preset);
		// Reset code to default for the new language if current code is a default
		const currentCode = this.$code.get();
		const isDefault = Object.values(DEFAULT_CODES).some(
			(d) => d.trim() === currentCode.trim(),
		);
		if (isDefault) {
			this.$code.set(DEFAULT_CODES[preset.language] ?? '');
		}
	}

	public async run(token: string): Promise<void> {
		this._abortController?.abort();
		this._abortController = new AbortController();

		const code = this.$code.get();
		if (!code.trim()) {
			this.$error.set('No code to run');
			return;
		}

		const preset = this.$preset.get();
		this.$phase.set('creating');
		this.$result.set(null);
		this.$error.set(null);

		try {
			const createResp = await fcFetch<{ vm_id: string; status: string }>(
				token,
				'/vm/create',
				'POST',
				{
					rootfs: preset.rootfs,
					vcpu_count: preset.vcpu_count,
					mem_size_mib: preset.mem_size_mib,
					timeout_ms: preset.timeout_ms,
					entrypoint: preset.entrypoint,
					env: { CODE: code },
					boot_args: 'console=ttyS0 reboot=k panic=1',
				},
			);

			const vmId = createResp.vm_id;
			this.$phase.set('running');

			const deadline = Date.now() + preset.timeout_ms + 5000;
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
					this._pushHistory(result, null);
					this.$phase.set(
						result.status === 'completed' && result.exit_code === 0
							? 'completed'
							: 'failed',
					);
					return;
				}

				await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
			}

			try {
				const result = await fcFetch<RunResult>(
					token,
					`/vm/${vmId}/result`,
				);
				this.$result.set(result);
			} catch {
				// ignore
			}
			const timeoutErr = `Execution timed out after ${preset.timeout_ms / 1000}s`;
			this.$phase.set('failed');
			this.$error.set(timeoutErr);
			this._pushHistory(this.$result.get(), timeoutErr);
		} catch (e) {
			const errMsg = e instanceof Error ? e.message : 'Unknown error';
			this.$phase.set('failed');
			this.$error.set(errMsg);
			this._pushHistory(null, errMsg);
		}
	}

	public cancel(): void {
		this._abortController?.abort();
		this._abortController = null;
		this.$phase.set('idle');
	}
}

export const ideService = new IDEService();
