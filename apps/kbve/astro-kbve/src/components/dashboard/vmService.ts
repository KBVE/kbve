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

// ---------------------------------------------------------------------------
// VM State Bitmask — composable flags for UI decisions
// ---------------------------------------------------------------------------
// Each flag represents a capability or condition. Combine with bitwise OR.
// UI components check flags instead of string comparisons:
//   if (state & VMState.CAN_START) showStartButton();
//   if (state & VMState.CAN_CONNECT) showVNC/RDP();

export const VMState = {
	/** VM exists and is known to the cluster */
	EXISTS: 0b0000_0001,
	/** VM is actively running (guest OS booted) */
	RUNNING: 0b0000_0010,
	/** VM is in a transition state (starting, stopping, migrating) */
	TRANSITIONING: 0b0000_0100,
	/** VM can be started (stopped or failed, not already transitioning) */
	CAN_START: 0b0000_1000,
	/** VM can be stopped (running or paused) */
	CAN_STOP: 0b0001_0000,
	/** VM can be restarted (running) */
	CAN_RESTART: 0b0010_0000,
	/** VM has a connectable display (VNC/RDP available) */
	CAN_CONNECT: 0b0100_0000,
	/** VM is in an error state (failed, crash loop) */
	ERROR: 0b1000_0000,
} as const;

export type VMStateFlags = number;

/** Map any KubeVirt phase string → bitmask flags.
 *  Handles every known phase + unknown ones gracefully. */
export function phaseToState(phase: string): VMStateFlags {
	const PHASE_MAP: Record<string, VMStateFlags> = {
		// VMI phases (from K8s API)
		Running:
			VMState.EXISTS |
			VMState.RUNNING |
			VMState.CAN_STOP |
			VMState.CAN_RESTART |
			VMState.CAN_CONNECT,
		Succeeded: VMState.EXISTS | VMState.CAN_START,
		Failed: VMState.EXISTS | VMState.CAN_START | VMState.ERROR,
		Pending: VMState.EXISTS | VMState.TRANSITIONING,
		Scheduling: VMState.EXISTS | VMState.TRANSITIONING,

		// VM printableStatus values
		Starting: VMState.EXISTS | VMState.TRANSITIONING,
		Stopping: VMState.EXISTS | VMState.TRANSITIONING,
		Stopped: VMState.EXISTS | VMState.CAN_START,
		Paused:
			VMState.EXISTS |
			VMState.RUNNING |
			VMState.CAN_STOP |
			VMState.CAN_RESTART,
		Migrating:
			VMState.EXISTS |
			VMState.RUNNING |
			VMState.TRANSITIONING |
			VMState.CAN_CONNECT,
		Provisioning: VMState.EXISTS | VMState.TRANSITIONING,
		WaitingForVolumeBinding: VMState.EXISTS | VMState.TRANSITIONING,
		ErrorUnschedulable: VMState.EXISTS | VMState.ERROR | VMState.CAN_START,
		CrashLoopBackOff: VMState.EXISTS | VMState.ERROR | VMState.CAN_START,
		Unknown: VMState.EXISTS,
	};

	return PHASE_MAP[phase] ?? VMState.EXISTS;
}

/** Resolve the display phase from bitmask (for UI labels/colors). */
export function stateToPhase(state: VMStateFlags): VMPhase {
	if (state & VMState.ERROR) return 'Stopped';
	if (state & VMState.RUNNING && !(state & VMState.TRANSITIONING))
		return 'Running';
	if (state & VMState.TRANSITIONING) {
		if (state & VMState.RUNNING) return 'Migrating';
		if (state & VMState.CAN_START) return 'Stopping';
		return 'Starting';
	}
	if (state & VMState.CAN_START) return 'Stopped';
	return 'Unknown';
}

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
	/** Bitmask state flags — use VMState.CAN_START etc. for UI decisions */
	state: VMStateFlags;
	osType: 'windows' | 'macos' | 'linux' | 'unknown';
	/** Minutes since VMI started — undefined if not running */
	uptimeMinutes?: number;
	/** Runner label from VM labels (e.g. "UE5-Win") — signals KEDA-managed */
	runnerLabel?: string;
	/** True if the VM is KEDA-managed (has a runner label) */
	isKedaManaged: boolean;
	/** True if uptime is under the idle timeout — a job may be active */
	mayHaveActiveJob: boolean;
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

	const resp = await fetch(`${PROXY_BASE}${path}`, opts);

	if (resp.status === 403) throw new AccessRestrictedError();
	if (!resp.ok) {
		const text = await resp.text().catch(() => '');
		throw new Error(`K8s API error ${resp.status}: ${text.slice(0, 200)}`);
	}

	// KubeVirt subresource actions (start/stop/restart) return empty body.
	// Only parse JSON if there's actually content to parse.
	const text = await resp.text();
	if (!text || text.trim().length === 0) return {} as T;
	try {
		return JSON.parse(text) as T;
	} catch {
		return {} as T;
	}
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

/** Compute bitmask state from VM + VMI. Single source of truth for UI decisions. */
export function getVMState(
	vm: VirtualMachine,
	vmi?: VirtualMachineInstance,
): VMStateFlags {
	if (vmi) {
		const rawPhase = (vmi.status?.phase as string) ?? 'Unknown';
		return phaseToState(rawPhase);
	}
	const status = vm.status?.printableStatus ?? '';
	if (status) return phaseToState(status);
	if (vm.spec.running === false) return phaseToState('Stopped');
	if (vm.spec.runStrategy === 'Manual' && !vm.status?.ready)
		return phaseToState('Stopped');
	return phaseToState('Unknown');
}

/** Get display phase from VM + VMI. Uses bitmask internally. */
export function getPhase(
	vm: VirtualMachine,
	vmi?: VirtualMachineInstance,
): VMPhase {
	return stateToPhase(getVMState(vm, vmi));
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
	public readonly $guacTarget = atom<string | null>(null);

	public readonly $vmInfos = computed(
		[this.$vms, this.$vmis],
		(vms, vmis): VMInfo[] =>
			vms.map((vm) => {
				const vmi = vmis.find(
					(i) => i.metadata.name === vm.metadata.name,
				);
				const state = getVMState(vm, vmi);
				const phase = stateToPhase(state);

				// Runner label detection — VMs managed by KEDA have a runner label
				const labels = vm.metadata.labels ?? {};
				const runnerLabel =
					labels['runner'] ??
					labels['github-actions-runner'] ??
					labels['actions-runner'] ??
					undefined;
				const isKedaManaged = !!runnerLabel;

				// Uptime calculation from VMI creation timestamp
				let uptimeMinutes: number | undefined;
				if (vmi?.metadata.creationTimestamp && phase === 'Running') {
					const created = new Date(
						vmi.metadata.creationTimestamp,
					).getTime();
					uptimeMinutes = Math.floor((Date.now() - created) / 60000);
				}

				// A KEDA-managed VM running for < 30 min likely has an active job
				const mayHaveActiveJob =
					isKedaManaged &&
					phase === 'Running' &&
					uptimeMinutes !== undefined &&
					uptimeMinutes < 30;

				return {
					vm,
					vmi,
					phase,
					state,
					osType: detectOS(vm),
					uptimeMinutes,
					runnerLabel,
					isKedaManaged,
					mayHaveActiveJob,
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

	// --- Guacamole RDP ---

	public openGuac(name: string): void {
		this.$guacTarget.set(name);
	}

	public closeGuac(): void {
		this.$guacTarget.set(null);
	}

	public getVNCWebSocketURL(name: string): string {
		// Dedicated VNC WebSocket bridge — axum handles auth + upstream relay.
		// Browser WebSocket API cannot set custom headers, so pass JWT as
		// query param. The backend accepts ?access_token= for WS auth.
		const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const token = this.$accessToken.get() ?? '';
		return `${proto}//${window.location.host}/dashboard/vm/vnc/${name}?access_token=${token}`;
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
