import { atom, computed } from 'nanostores';
import { initSupa, getSupa } from '@/lib/supa';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthState =
	| 'loading'
	| 'authenticated'
	| 'unauthenticated'
	| 'forbidden';

export type VMPhase =
	| 'Running'
	| 'Stopped'
	| 'Starting'
	| 'Stopping'
	| 'Paused'
	| 'Migrating'
	| 'Unknown';

export interface VirtualMachine {
	metadata: {
		name: string;
		namespace: string;
		creationTimestamp: string;
		labels?: Record<string, string>;
	};
	spec: {
		running?: boolean;
		runStrategy?: string;
		template: {
			spec: {
				domain: {
					cpu?: {
						cores?: number;
						sockets?: number;
						threads?: number;
					};
					resources?: {
						requests?: { memory?: string; cpu?: string };
						limits?: { memory?: string; cpu?: string };
					};
					memory?: { guest?: string };
					machine?: { type?: string };
					devices?: {
						disks?: Array<{
							name: string;
							disk?: { bus?: string };
							cdrom?: { bus?: string };
							bootOrder?: number;
						}>;
					};
					features?: {
						hyperv?: Record<string, unknown>;
						acpi?: { enabled?: boolean };
					};
				};
				volumes?: Array<{
					name: string;
					persistentVolumeClaim?: { claimName: string };
					containerDisk?: { image: string };
					dataVolume?: { name: string };
				}>;
			};
		};
	};
	status?: {
		created?: boolean;
		ready?: boolean;
		printableStatus?: string;
		conditions?: Array<{
			type: string;
			status: string;
			reason?: string;
			message?: string;
			lastTransitionTime?: string;
		}>;
	};
}

export interface VirtualMachineInstance {
	metadata: {
		name: string;
		namespace: string;
		creationTimestamp: string;
	};
	status: {
		phase: VMPhase;
		nodeName?: string;
		guestOSInfo?: {
			name?: string;
			id?: string;
			version?: string;
			prettyName?: string;
		};
		interfaces?: Array<{
			ipAddress?: string;
			mac?: string;
			name: string;
		}>;
		migrationState?: {
			completed?: boolean;
			targetNode?: string;
		};
	};
	spec: {
		domain: {
			cpu?: { cores?: number; sockets?: number; threads?: number };
			resources?: {
				requests?: { memory?: string; cpu?: string };
				limits?: { memory?: string; cpu?: string };
			};
			memory?: { guest?: string };
		};
	};
}

export interface VMInfo {
	vm: VirtualMachine;
	vmi?: VirtualMachineInstance;
	phase: VMPhase;
	osType: 'windows' | 'macos' | 'linux' | 'unknown';
}

interface CachedData {
	ts: number;
	vms: VirtualMachine[];
	vmis: VirtualMachineInstance[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'cache:kubevirt:vms';
const CACHE_TTL_MS = 30 * 1000;
const PROXY_BASE = '/dashboard/vm/proxy';
const VM_NAMESPACE = 'angelscript';
const REFRESH_INTERVAL_MS = 15 * 1000;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

class AccessRestrictedError extends Error {
	constructor() {
		super('Access restricted');
		this.name = 'AccessRestrictedError';
	}
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiFetch<T>(
	token: string,
	path: string,
	method = 'GET',
	body?: unknown,
): Promise<T> {
	const opts: RequestInit = {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		signal: AbortSignal.timeout(15000),
	};
	if (body) opts.body = JSON.stringify(body);

	const resp = await fetch(`${PROXY_BASE}${path}`, opts);

	if (resp.status === 403) throw new AccessRestrictedError();
	if (!resp.ok) {
		const text = await resp.text().catch(() => '');
		throw new Error(`K8s API error ${resp.status}: ${text.slice(0, 200)}`);
	}

	return resp.json();
}

async function fetchVMs(token: string): Promise<VirtualMachine[]> {
	const data = await apiFetch<{ items: VirtualMachine[] }>(
		token,
		`/apis/kubevirt.io/v1/namespaces/${VM_NAMESPACE}/virtualmachines`,
	);
	return data.items ?? [];
}

async function fetchVMIs(token: string): Promise<VirtualMachineInstance[]> {
	const data = await apiFetch<{ items: VirtualMachineInstance[] }>(
		token,
		`/apis/kubevirt.io/v1/namespaces/${VM_NAMESPACE}/virtualmachineinstances`,
	);
	return data.items ?? [];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function detectOS(vm: VirtualMachine): VMInfo['osType'] {
	const name = vm.metadata.name.toLowerCase();
	const labels = vm.metadata.labels ?? {};
	const osLabel = (
		labels['os'] ??
		labels['kubevirt.io/os'] ??
		''
	).toLowerCase();

	if (
		name.includes('windows') ||
		name.includes('win') ||
		osLabel === 'windows'
	)
		return 'windows';
	if (name.includes('mac') || name.includes('darwin') || osLabel === 'macos')
		return 'macos';
	if (name.includes('linux') || osLabel === 'linux') return 'linux';
	return 'unknown';
}

export function getPhase(
	vm: VirtualMachine,
	vmi?: VirtualMachineInstance,
): VMPhase {
	if (vmi) return vmi.status?.phase ?? 'Unknown';
	const status = vm.status?.printableStatus;
	if (status === 'Running') return 'Running';
	if (status === 'Starting') return 'Starting';
	if (status === 'Stopping') return 'Stopping';
	if (status === 'Stopped' || status === 'Provisioning') return 'Stopped';
	if (vm.spec.running === false) return 'Stopped';
	if (vm.spec.runStrategy === 'Manual' && !vm.status?.ready) return 'Stopped';
	return (status as VMPhase) ?? 'Unknown';
}

export function phaseColor(phase: VMPhase): string {
	switch (phase) {
		case 'Running':
			return '#22c55e';
		case 'Stopped':
			return '#6b7280';
		case 'Starting':
		case 'Migrating':
			return '#f59e0b';
		case 'Stopping':
			return '#ef4444';
		case 'Paused':
			return '#8b5cf6';
		default:
			return '#6b7280';
	}
}

export function getCPUCores(vm: VirtualMachine): number {
	const cpu = vm.spec.template.spec.domain.cpu;
	return (cpu?.cores ?? 1) * (cpu?.sockets ?? 1) * (cpu?.threads ?? 1);
}

export function getMemory(vm: VirtualMachine): string {
	return (
		vm.spec.template.spec.domain.memory?.guest ??
		vm.spec.template.spec.domain.resources?.requests?.memory ??
		'?'
	);
}

export function getDisks(
	vm: VirtualMachine,
): Array<{ name: string; type: string; source: string }> {
	const disks = vm.spec.template.spec.domain.devices?.disks ?? [];
	const volumes = vm.spec.template.spec.volumes ?? [];

	return disks.map((d) => {
		const vol = volumes.find((v) => v.name === d.name);
		let type = 'unknown';
		let source = '';
		if (vol?.persistentVolumeClaim) {
			type = 'PVC';
			source = vol.persistentVolumeClaim.claimName;
		} else if (vol?.containerDisk) {
			type = 'Container';
			source =
				vol.containerDisk.image.split('/').pop() ??
				vol.containerDisk.image;
		} else if (vol?.dataVolume) {
			type = 'DataVolume';
			source = vol.dataVolume.name;
		}
		return { name: d.name, type, source };
	});
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function loadCache(): CachedData | null {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return null;
		const parsed: CachedData = JSON.parse(raw);
		if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
		return parsed;
	} catch {
		return null;
	}
}

function saveCache(
	vms: VirtualMachine[],
	vmis: VirtualMachineInstance[],
): void {
	try {
		localStorage.setItem(
			CACHE_KEY,
			JSON.stringify({ ts: Date.now(), vms, vmis }),
		);
	} catch {
		// ignore
	}
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class VMService {
	public readonly $authState = atom<AuthState>('loading');
	public readonly $accessToken = atom<string | null>(null);

	public readonly $vms = atom<VirtualMachine[]>([]);
	public readonly $vmis = atom<VirtualMachineInstance[]>([]);
	public readonly $loading = atom<boolean>(true);
	public readonly $error = atom<string | null>(null);
	public readonly $lastUpdated = atom<Date | null>(null);
	public readonly $actionInProgress = atom<string | null>(null);
	public readonly $vncTarget = atom<string | null>(null);

	public readonly $vmInfos = computed(
		[this.$vms, this.$vmis],
		(vms, vmis): VMInfo[] =>
			vms.map((vm) => {
				const vmi = vmis.find(
					(i) => i.metadata.name === vm.metadata.name,
				);
				return {
					vm,
					vmi,
					phase: getPhase(vm, vmi),
					osType: detectOS(vm),
				};
			}),
	);

	public readonly $runningCount = computed(
		[this.$vmInfos],
		(infos) => infos.filter((i) => i.phase === 'Running').length,
	);

	public readonly $totalCount = computed(
		[this.$vmInfos],
		(infos) => infos.length,
	);

	private _refreshInterval: ReturnType<typeof setInterval> | undefined;

	public async initAuth(): Promise<void> {
		try {
			await initSupa();
			const supa = getSupa();
			const sessionResult = await supa.getSession().catch(() => null);
			const session = sessionResult?.session ?? null;

			if (!session?.access_token) {
				this.$authState.set('unauthenticated');
				return;
			}

			this.$accessToken.set(session.access_token as string);
			this.$authState.set('authenticated');
		} catch {
			this.$authState.set('unauthenticated');
		}
	}

	public async fetchData(): Promise<void> {
		const token = this.$accessToken.get();
		if (!token) return;

		try {
			this.$error.set(null);
			const [vms, vmis] = await Promise.all([
				fetchVMs(token),
				fetchVMIs(token),
			]);
			this.$vms.set(vms);
			this.$vmis.set(vmis);
			this.$lastUpdated.set(new Date());
			saveCache(vms, vmis);
		} catch (e: unknown) {
			if (e instanceof AccessRestrictedError) {
				this.$authState.set('forbidden');
				return;
			}
			this.$error.set(e instanceof Error ? e.message : 'Unknown error');
		} finally {
			this.$loading.set(false);
		}
	}

	public loadCacheAndFetch(): void {
		const token = this.$accessToken.get();
		if (!token) return;

		const cached = loadCache();
		if (cached) {
			this.$vms.set(cached.vms);
			this.$vmis.set(cached.vmis);
			this.$lastUpdated.set(new Date(cached.ts));
			this.$loading.set(false);
		}

		this.fetchData();
		this._startAutoRefresh();
	}

	public refresh(): void {
		const token = this.$accessToken.get();
		if (token) {
			this.$loading.set(true);
			this.fetchData();
		}
	}

	// --- VM Actions ---

	public async startVM(name: string): Promise<void> {
		await this._vmAction(name, 'start');
	}

	public async stopVM(name: string): Promise<void> {
		await this._vmAction(name, 'stop');
	}

	public async restartVM(name: string): Promise<void> {
		await this._vmAction(name, 'restart');
	}

	private async _vmAction(
		name: string,
		action: 'start' | 'stop' | 'restart',
	): Promise<void> {
		const token = this.$accessToken.get();
		if (!token) return;

		this.$actionInProgress.set(`${action}:${name}`);
		try {
			await apiFetch(
				token,
				`/apis/subresources.kubevirt.io/v1/namespaces/${VM_NAMESPACE}/virtualmachines/${name}/${action}`,
				'PUT',
				{},
			);
			// Refresh after short delay to let K8s reconcile
			setTimeout(() => this.fetchData(), 2000);
		} catch (e) {
			this.$error.set(
				e instanceof Error ? e.message : `Failed to ${action} ${name}`,
			);
		} finally {
			this.$actionInProgress.set(null);
		}
	}

	// --- VNC ---

	public openVNC(name: string): void {
		this.$vncTarget.set(name);
	}

	public closeVNC(): void {
		this.$vncTarget.set(null);
	}

	public getVNCWebSocketURL(name: string): string {
		// Dedicated VNC WebSocket bridge — axum handles auth + upstream relay
		const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		return `${proto}//${window.location.host}/dashboard/vm/vnc/${name}`;
	}

	private _startAutoRefresh(): void {
		if (this._refreshInterval) clearInterval(this._refreshInterval);
		this._refreshInterval = setInterval(
			() => this.fetchData(),
			REFRESH_INTERVAL_MS,
		);
	}
}

export const vmService = new VMService();
