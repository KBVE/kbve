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

export interface CodeExample {
	id: string;
	label: string;
	language: string;
	code: string;
}

export const EXAMPLES: CodeExample[] = [
	{
		id: 'py-fibonacci',
		label: 'Fibonacci',
		language: 'python',
		code: `# Generate Fibonacci sequence
def fibonacci(n):
    a, b = 0, 1
    result = []
    for _ in range(n):
        result.append(a)
        a, b = b, a + b
    return result

print(f"First 20 Fibonacci numbers:")
print(fibonacci(20))
`,
	},
	{
		id: 'py-sysinfo',
		label: 'System Info',
		language: 'python',
		code: `# Inspect the Firecracker microVM environment
import os, platform, sys

print(f"Python:   {sys.version}")
print(f"Platform: {platform.platform()}")
print(f"Machine:  {platform.machine()}")
print(f"CPU:      {os.cpu_count()} cores")
print(f"PID:      {os.getpid()}")
print(f"CWD:      {os.getcwd()}")
print(f"User:     {os.getenv('USER', 'unknown')}")

# Memory info from /proc
try:
    with open("/proc/meminfo") as f:
        for line in f:
            if line.startswith(("MemTotal", "MemFree", "MemAvailable")):
                print(line.strip())
except FileNotFoundError:
    print("(no /proc/meminfo)")
`,
	},
	{
		id: 'py-primes',
		label: 'Prime Sieve',
		language: 'python',
		code: `# Sieve of Eratosthenes — benchmark the VM
import time

def sieve(limit):
    is_prime = [True] * (limit + 1)
    is_prime[0] = is_prime[1] = False
    for i in range(2, int(limit**0.5) + 1):
        if is_prime[i]:
            for j in range(i*i, limit + 1, i):
                is_prime[j] = False
    return [i for i in range(limit + 1) if is_prime[i]]

start = time.time()
primes = sieve(1_000_000)
elapsed = time.time() - start

print(f"Found {len(primes):,} primes up to 1,000,000")
print(f"Elapsed: {elapsed:.3f}s")
print(f"Last 10: {primes[-10:]}")
`,
	},
	{
		id: 'js-fetch-sim',
		label: 'JSON Parser',
		language: 'javascript',
		code: `// Parse and transform JSON data
const data = {
  users: [
    { name: "Alice", age: 30, role: "admin" },
    { name: "Bob", age: 25, role: "user" },
    { name: "Charlie", age: 35, role: "admin" },
  ]
};

const admins = data.users
  .filter(u => u.role === "admin")
  .map(u => \`\${u.name} (age \${u.age})\`);

console.log("Admins:", admins.join(", "));
console.log("Average age:", data.users.reduce((s, u) => s + u.age, 0) / data.users.length);
console.log("Node version:", process.version);
`,
	},
	{
		id: 'sh-disk',
		label: 'VM Inspection',
		language: 'shell',
		code: `#!/bin/sh
echo "=== Firecracker MicroVM ==="
echo "Hostname: $(hostname)"
echo "Kernel:   $(uname -r)"
echo "Arch:     $(uname -m)"
echo "Uptime:   $(cat /proc/uptime | cut -d' ' -f1)s"
echo ""
echo "=== Memory ==="
free -h 2>/dev/null || cat /proc/meminfo | head -3
echo ""
echo "=== Mounts ==="
mount | head -5
echo ""
echo "=== Processes ==="
ps aux 2>/dev/null || echo "PID 1: $(cat /proc/1/cmdline | tr '\\0' ' ')"
`,
	},
];

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
					boot_args: 'console=ttyS0 reboot=k panic=1 init=/init',
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
