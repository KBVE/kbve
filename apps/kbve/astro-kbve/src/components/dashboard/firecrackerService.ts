import { atom, computed } from 'nanostores';
import { vmService } from './vmService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FirecrackerVM {
	vm_id: string;
	status:
		| 'creating'
		| 'running'
		| 'completed'
		| 'failed'
		| 'timeout'
		| 'destroyed';
	rootfs: string;
	vcpu_count: number;
	mem_size_mib: number;
	created_at: string;
}

export interface FirecrackerHealth {
	status: string;
	service: string;
	version: string;
	timestamp: string;
}

export type FirecrackerPhase =
	| 'Running'
	| 'Completed'
	| 'Failed'
	| 'Creating'
	| 'Timeout'
	| 'Destroyed';

export interface FirecrackerInfo {
	vm: FirecrackerVM;
	phase: FirecrackerPhase;
}

export interface CreateVmRequest {
	rootfs: string;
	entrypoint: string;
	vcpu_count?: number;
	mem_size_mib?: number;
	timeout_ms?: number;
	env?: Record<string, string>;
}

export interface VmResult {
	vm_id: string;
	status: string;
	exit_code: number | null;
	stdout: string;
	stderr: string;
	duration_ms: number | null;
}

export interface ScriptPreset {
	name: string;
	description: string;
	rootfs: string;
	entrypoint: string;
	vcpu_count: number;
	mem_size_mib: number;
	timeout_ms: number;
}

export const SCRIPT_PRESETS: ScriptPreset[] = [
	{
		name: 'System Info',
		description: 'Print kernel, CPU, and memory info',
		rootfs: 'alpine-minimal',
		entrypoint: 'uname -a && cat /proc/cpuinfo | head -20 && free -m',
		vcpu_count: 1,
		mem_size_mib: 128,
		timeout_ms: 15000,
	},
	{
		name: 'Disk Benchmark',
		description: 'Write/read 64MB to measure I/O speed',
		rootfs: 'alpine-minimal',
		entrypoint:
			'dd if=/dev/zero of=/tmp/bench bs=1M count=64 2>&1 && dd if=/tmp/bench of=/dev/null bs=1M 2>&1 && rm /tmp/bench',
		vcpu_count: 1,
		mem_size_mib: 128,
		timeout_ms: 30000,
	},
	{
		name: 'Network Test',
		description: 'Check DNS resolution and HTTP connectivity',
		rootfs: 'alpine-minimal',
		entrypoint:
			'nslookup kbve.com 2>&1 || echo "DNS failed"; wget -qO- --timeout=5 http://ifconfig.me 2>&1 || echo "HTTP failed"',
		vcpu_count: 1,
		mem_size_mib: 128,
		timeout_ms: 20000,
	},
	{
		name: 'Python Hello',
		description: 'Run a basic Python script',
		rootfs: 'alpine-python',
		entrypoint:
			"python3 -c \"import sys,platform; print(f'Python {sys.version}'); print(f'Platform: {platform.platform()}')\"",
		vcpu_count: 1,
		mem_size_mib: 256,
		timeout_ms: 15000,
	},
	{
		name: 'Node.js Hello',
		description: 'Run a basic Node.js script',
		rootfs: 'alpine-node',
		entrypoint:
			"node -e \"console.log('Node', process.version); console.log('Arch:', process.arch); console.log('Memory:', Math.round(require('os').totalmem()/1024/1024), 'MiB')\"",
		vcpu_count: 1,
		mem_size_mib: 256,
		timeout_ms: 15000,
	},
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FC_PROXY_BASE = '/dashboard/firecracker/proxy';
const REFRESH_INTERVAL_MS = 10_000;

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
		signal: AbortSignal.timeout(15000),
	};
	if (body !== undefined) {
		headers['Content-Type'] = 'application/json';
		opts.body = JSON.stringify(body);
	}

	const resp = await fetch(`${FC_PROXY_BASE}${path}`, opts);
	if (!resp.ok) {
		const text = await resp.text().catch(() => '');
		throw new Error(
			`Firecracker API error ${resp.status}: ${text.slice(0, 200)}`,
		);
	}

	const text = await resp.text();
	if (!text || text.trim().length === 0) return {} as T;
	try {
		return JSON.parse(text) as T;
	} catch {
		return {} as T;
	}
}

// ---------------------------------------------------------------------------
// Phase mapping
// ---------------------------------------------------------------------------

function vmPhase(status: FirecrackerVM['status']): FirecrackerPhase {
	switch (status) {
		case 'running':
			return 'Running';
		case 'creating':
			return 'Creating';
		case 'completed':
			return 'Completed';
		case 'failed':
			return 'Failed';
		case 'timeout':
			return 'Timeout';
		case 'destroyed':
			return 'Destroyed';
		default:
			return 'Failed';
	}
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class FirecrackerService {
	public readonly $vms = atom<FirecrackerInfo[]>([]);
	public readonly $health = atom<FirecrackerHealth | null>(null);
	public readonly $loading = atom<boolean>(true);
	public readonly $error = atom<string | null>(null);
	public readonly $actionInProgress = atom<string | null>(null);
	public readonly $lastAction = atom<{
		vm_id: string;
		ok: boolean;
		message: string;
	} | null>(null);

	public readonly $runningCount = computed(
		[this.$vms],
		(vms) => vms.filter((v) => v.phase === 'Running').length,
	);

	public readonly $totalCount = computed([this.$vms], (vms) => vms.length);

	private _refreshInterval: ReturnType<typeof setInterval> | undefined;

	public async fetchData(token: string): Promise<void> {
		try {
			this.$error.set(null);

			// Fetch health and VM list in parallel
			const [healthData, vmData] = await Promise.allSettled([
				fcFetch<FirecrackerHealth>(token, '/health'),
				fcFetch<{ vms: FirecrackerVM[]; count: number }>(token, '/vm'),
			]);

			if (healthData.status === 'fulfilled') {
				this.$health.set(healthData.value);
			}

			if (vmData.status === 'fulfilled') {
				const vms = (vmData.value.vms ?? []).map((vm) => ({
					vm: vm,
					phase: vmPhase(vm.status),
				}));
				this.$vms.set(vms);
			} else if (vmData.status === 'rejected') {
				// Service unreachable — show health status only
				this.$vms.set([]);
				if (healthData.status === 'rejected') {
					this.$error.set('Firecracker service unreachable');
				}
			}
		} catch (e) {
			this.$error.set(e instanceof Error ? e.message : 'Unknown error');
		} finally {
			this.$loading.set(false);
		}
	}

	public startAutoRefresh(token: string): void {
		if (this._refreshInterval) clearInterval(this._refreshInterval);
		this._refreshInterval = setInterval(
			() => this.fetchData(token),
			REFRESH_INTERVAL_MS,
		);
	}

	public readonly $results = atom<Record<string, VmResult>>({});
	public readonly $creating = atom<boolean>(false);

	public async createVM(token: string, req: CreateVmRequest): Promise<void> {
		this.$creating.set(true);
		try {
			const res = await fcFetch<{ vm_id: string }>(
				token,
				'/vm/create',
				'POST',
				req,
			);
			this.$lastAction.set({
				vm_id: res.vm_id ?? 'new',
				ok: true,
				message: `VM created: ${(res.vm_id ?? '').slice(0, 12)}`,
			});
			await this.fetchData(token);
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Failed to create VM';
			this.$lastAction.set({ vm_id: 'new', ok: false, message: msg });
		} finally {
			this.$creating.set(false);
		}
	}

	public async fetchResult(token: string, vmId: string): Promise<void> {
		try {
			const result = await fcFetch<VmResult>(token, `/vm/${vmId}/result`);
			this.$results.set({ ...this.$results.get(), [vmId]: result });
		} catch {
			// Result not yet available — ignore
		}
	}

	public async destroyVM(token: string, vmId: string): Promise<void> {
		this.$actionInProgress.set(`destroy:${vmId}`);
		this.$lastAction.set({
			vm_id: vmId,
			ok: true,
			message: 'Destroying...',
		});
		try {
			await fcFetch(token, `/vm/${vmId}`, 'DELETE');
			this.$lastAction.set({
				vm_id: vmId,
				ok: true,
				message: `VM ${vmId.slice(0, 12)} destroyed`,
			});
			// Refresh immediately
			await this.fetchData(token);
		} catch (e) {
			const msg =
				e instanceof Error ? e.message : `Failed to destroy ${vmId}`;
			this.$lastAction.set({ vm_id: vmId, ok: false, message: msg });
		} finally {
			this.$actionInProgress.set(null);
		}
	}
}

export const firecrackerService = new FirecrackerService();
