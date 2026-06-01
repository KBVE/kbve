import { atom, computed } from 'nanostores';
import { getSupa } from '@/lib/supa';
import { fetchIndexedLogs } from './clickhouseService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KasmResourceSpec {
	cpu?: string;
	memory?: string;
}

export interface KasmResources {
	requests?: KasmResourceSpec;
	limits?: KasmResourceSpec;
}

export interface KasmWorkspace {
	name: string;
	namespace: string;
	replicas: number;
	readyReplicas: number;
	image: string;
	vpnStatus: 'connected' | 'disconnected' | 'unknown';
	/** KASM web port (usually 6901) */
	port: number;
	/** Service URL for accessing the workspace */
	serviceUrl: string;
	/** Resources from the workspace container (not gluetun) */
	resources?: KasmResources;
}

export type KasmPhase = 'Running' | 'Stopped' | 'Starting' | 'Error';

export interface KasmInfo {
	workspace: KasmWorkspace;
	phase: KasmPhase;
	/** Bitmask state matching VMState pattern */
	state: number;
}

// Reuse VMState bitmask pattern for consistency
export const KasmState = {
	EXISTS: 0b0000_0001,
	RUNNING: 0b0000_0010,
	TRANSITIONING: 0b0000_0100,
	CAN_START: 0b0000_1000,
	CAN_STOP: 0b0001_0000,
	CAN_CONNECT: 0b0100_0000,
	ERROR: 0b1000_0000,
	VPN_ACTIVE: 0b1_0000_0000,
} as const;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROXY_BASE = '/dashboard/vm/proxy';
const KASM_NAMESPACE = 'kasm';
const REFRESH_INTERVAL_MS = 15_000;
const SUPERVISOR_WINDOW_MIN = 60;
const SUPERVISOR_REFRESH_MS = 60_000;
const SUPERVISOR_FETCH_LIMIT = 500;

export interface SupervisorActivity {
	cloak: number;
	discord: number;
	windowMin: number;
	fetchedAt: Date;
}

const SUPERVISOR_PATTERNS = {
	cloak: 'launching cloakbrowser',
	discord: 'launching discord',
} as const;

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function kasmFetch<T>(
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
	if (!resp.ok) {
		const text = await resp.text().catch(() => '');
		throw new Error(`K8s API error ${resp.status}: ${text.slice(0, 200)}`);
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
// Workspace discovery
// ---------------------------------------------------------------------------

interface K8sDeployment {
	metadata: { name: string; namespace: string };
	spec: {
		replicas: number;
		template: {
			spec: {
				containers: Array<{
					name: string;
					image: string;
					ports?: Array<{ containerPort: number }>;
					resources?: {
						requests?: { cpu?: string; memory?: string };
						limits?: { cpu?: string; memory?: string };
					};
				}>;
			};
		};
	};
	status?: {
		readyReplicas?: number;
		availableReplicas?: number;
	};
}

async function fetchKasmDeployments(token: string): Promise<K8sDeployment[]> {
	const data = await kasmFetch<{ items: K8sDeployment[] }>(
		token,
		`/apis/apps/v1/namespaces/${KASM_NAMESPACE}/deployments?labelSelector=app.kubernetes.io/part-of=kasm`,
	);
	return data.items ?? [];
}

function deploymentToWorkspace(dep: K8sDeployment): KasmWorkspace {
	const workspaceContainer = dep.spec.template.spec.containers.find(
		(c) => c.name === 'workspace',
	);
	const gluetunContainer = dep.spec.template.spec.containers.find(
		(c) => c.name === 'gluetun',
	);

	const ready = dep.status?.readyReplicas ?? 0;
	const replicas = dep.spec.replicas ?? 0;

	let vpnStatus: KasmWorkspace['vpnStatus'] = 'unknown';
	if (gluetunContainer) {
		vpnStatus = ready > 0 ? 'connected' : 'disconnected';
	}

	const rawResources = workspaceContainer?.resources;
	const resources: KasmResources | undefined = rawResources
		? {
				requests: rawResources.requests
					? {
							cpu: rawResources.requests.cpu,
							memory: rawResources.requests.memory,
						}
					: undefined,
				limits: rawResources.limits
					? {
							cpu: rawResources.limits.cpu,
							memory: rawResources.limits.memory,
						}
					: undefined,
			}
		: undefined;

	return {
		name: dep.metadata.name,
		namespace: dep.metadata.namespace,
		replicas,
		readyReplicas: ready,
		image: workspaceContainer?.image ?? 'unknown',
		vpnStatus,
		port: 6901,
		serviceUrl: `${dep.metadata.name}-service.${KASM_NAMESPACE}.svc.cluster.local:6901`,
		resources,
	};
}

function workspacePhase(ws: KasmWorkspace): KasmPhase {
	if (ws.replicas === 0) return 'Stopped';
	if (ws.readyReplicas > 0) return 'Running';
	if (ws.replicas > 0 && ws.readyReplicas === 0) return 'Starting';
	return 'Error';
}

function workspaceState(ws: KasmWorkspace): number {
	const phase = workspacePhase(ws);
	switch (phase) {
		case 'Running':
			return (
				KasmState.EXISTS |
				KasmState.RUNNING |
				KasmState.CAN_STOP |
				KasmState.CAN_CONNECT |
				(ws.vpnStatus === 'connected' ? KasmState.VPN_ACTIVE : 0)
			);
		case 'Stopped':
			return KasmState.EXISTS | KasmState.CAN_START;
		case 'Starting':
			return KasmState.EXISTS | KasmState.TRANSITIONING;
		case 'Error':
			return KasmState.EXISTS | KasmState.ERROR | KasmState.CAN_START;
		default:
			return KasmState.EXISTS;
	}
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class KasmService {
	public readonly $workspaces = atom<KasmInfo[]>([]);
	public readonly $loading = atom<boolean>(true);
	public readonly $error = atom<string | null>(null);
	public readonly $actionInProgress = atom<string | null>(null);
	public readonly $supervisorActivity = atom<
		Record<string, SupervisorActivity>
	>({});

	private _supervisorInterval: ReturnType<typeof setInterval> | undefined;
	private _supervisorInflight = false;

	public readonly $runningCount = computed(
		[this.$workspaces],
		(ws) => ws.filter((w) => w.phase === 'Running').length,
	);

	public readonly $totalCount = computed(
		[this.$workspaces],
		(ws) => ws.length,
	);

	private _refreshInterval: ReturnType<typeof setInterval> | undefined;
	private _fastPollTimer: ReturnType<typeof setInterval> | undefined;
	private _fastPollEnd: ReturnType<typeof setTimeout> | undefined;

	/** Temporarily poll every 3s for 30s after a scale action */
	private startFastPoll(token: string): void {
		this.stopFastPoll();
		this._fastPollTimer = setInterval(() => this.fetchData(token), 3000);
		this._fastPollEnd = setTimeout(() => this.stopFastPoll(), 30000);
	}

	private stopFastPoll(): void {
		if (this._fastPollTimer) {
			clearInterval(this._fastPollTimer);
			this._fastPollTimer = undefined;
		}
		if (this._fastPollEnd) {
			clearTimeout(this._fastPollEnd);
			this._fastPollEnd = undefined;
		}
	}

	public async fetchData(token: string): Promise<void> {
		try {
			this.$error.set(null);
			const deployments = await fetchKasmDeployments(token);
			const workspaces = deployments.map((dep) => {
				const ws = deploymentToWorkspace(dep);
				return {
					workspace: ws,
					phase: workspacePhase(ws),
					state: workspaceState(ws),
				} as KasmInfo;
			});
			this.$workspaces.set(workspaces);

			// Clear action feedback once workspace reaches a stable state
			const action = this.$lastAction.get();
			if (action) {
				const target = workspaces.find(
					(w) => w.workspace.name === action.name,
				);
				if (
					target &&
					(target.phase === 'Running' || target.phase === 'Stopped')
				) {
					this.$lastAction.set(null);
					this.stopFastPoll();
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
		this.fetchSupervisorActivity(token);
		if (this._supervisorInterval) clearInterval(this._supervisorInterval);
		this._supervisorInterval = setInterval(
			() => this.fetchSupervisorActivity(token),
			SUPERVISOR_REFRESH_MS,
		);
	}

	public async fetchSupervisorActivity(token: string): Promise<void> {
		if (this._supervisorInflight) return;
		const workspaces = this.$workspaces.get();
		if (workspaces.length === 0) return;
		this._supervisorInflight = true;
		try {
			const [cloakRows, discordRows] = await Promise.all([
				fetchIndexedLogs(token, {
					namespace: KASM_NAMESPACE,
					search: SUPERVISOR_PATTERNS.cloak,
					minutes: SUPERVISOR_WINDOW_MIN,
					limit: SUPERVISOR_FETCH_LIMIT,
				}).catch(() => []),
				fetchIndexedLogs(token, {
					namespace: KASM_NAMESPACE,
					search: SUPERVISOR_PATTERNS.discord,
					minutes: SUPERVISOR_WINDOW_MIN,
					limit: SUPERVISOR_FETCH_LIMIT,
				}).catch(() => []),
			]);

			const fetchedAt = new Date();
			const next: Record<string, SupervisorActivity> = {};
			for (const info of workspaces) {
				const name = info.workspace.name;
				const cloak = cloakRows.filter((r) =>
					r.pod_name?.startsWith(name),
				).length;
				const discord = discordRows.filter((r) =>
					r.pod_name?.startsWith(name),
				).length;
				next[name] = {
					cloak,
					discord,
					windowMin: SUPERVISOR_WINDOW_MIN,
					fetchedAt,
				};
			}
			this.$supervisorActivity.set(next);
		} finally {
			this._supervisorInflight = false;
		}
	}

	/** Per-workspace action result — cleared after 5s or on next action */
	public readonly $lastAction = atom<{
		name: string;
		ok: boolean;
		message: string;
	} | null>(null);

	public async scaleWorkspace(
		token: string,
		name: string,
		replicas: number,
	): Promise<void> {
		const action = replicas > 0 ? 'Starting' : 'Stopping';
		this.$actionInProgress.set(`scale:${name}:${replicas}`);
		this.$lastAction.set({ name, ok: true, message: `${action}...` });
		try {
			// Use the dedicated scale endpoint (PUT) instead of the generic
			// VM proxy — the proxy forwards PATCH with application/json which
			// K8s rejects with 415 (Unsupported Media Type).
			const headers: Record<string, string> = {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			};
			const resp = await fetch(`/dashboard/kasm/scale/${name}`, {
				method: 'PUT',
				headers,
				body: JSON.stringify({ replicas }),
				signal: AbortSignal.timeout(15000),
			});
			if (!resp.ok) {
				const text = await resp.text().catch(() => '');
				throw new Error(
					`Scale failed ${resp.status}: ${text.slice(0, 200)}`,
				);
			}
			this.$lastAction.set({
				name,
				ok: true,
				message: `${action} ${name} — waiting for cluster...`,
			});
			// Poll aggressively every 3s for 30s to catch the pod transitioning
			this.startFastPoll(token);
		} catch (e) {
			const msg =
				e instanceof Error ? e.message : `Failed to scale ${name}`;
			this.$error.set(msg);
			this.$lastAction.set({ name, ok: false, message: msg });
			setTimeout(() => {
				if (this.$lastAction.get()?.name === name) {
					this.$lastAction.set(null);
				}
			}, 8000);
		} finally {
			this.$actionInProgress.set(null);
		}
	}

	public async startWorkspace(token: string, name: string): Promise<void> {
		await this.scaleWorkspace(token, name, 1);
	}

	public async stopWorkspace(token: string, name: string): Promise<void> {
		await this.scaleWorkspace(token, name, 0);
	}
}

export const kasmService = new KasmService();
