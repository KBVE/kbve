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
