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

export interface ArgoApplication {
	metadata: {
		name: string;
		namespace: string;
		creationTimestamp: string;
	};
	spec: {
		project: string;
		source?: {
			repoURL: string;
			path: string;
			targetRevision: string;
		};
		destination: {
			server: string;
			namespace: string;
		};
	};
	status: {
		sync: {
			status: string;
			revision?: string;
		};
		health: {
			status: string;
			message?: string;
		};
		operationState?: {
			phase: string;
			message?: string;
			finishedAt?: string;
			startedAt?: string;
		};
		reconciledAt?: string;
	};
}

export interface ResourceNode {
	group: string;
	version: string;
	kind: string;
	namespace: string;
	name: string;
	uid?: string;
	parentRefs?: Array<{
		group?: string;
		kind: string;
		namespace?: string;
		name: string;
		uid?: string;
	}>;
	info?: Array<{ name: string; value: string }>;
	createdAt?: string;
	resourceVersion?: string;
	health?: {
		status: string;
		message?: string;
	};
}

export interface ResourceTree {
	nodes: ResourceNode[];
}

export interface AppEvent {
	type?: string;
	reason?: string;
	message?: string;
	count?: number;
	firstTimestamp?: string;
	lastTimestamp?: string;
	eventTime?: string;
	source?: { component?: string; host?: string };
	involvedObject?: {
		kind?: string;
		namespace?: string;
		name?: string;
		uid?: string;
	};
	metadata?: { uid?: string; name?: string; namespace?: string };
}

export interface ManagedResource {
	group?: string;
	version?: string;
	kind: string;
	namespace?: string;
	name: string;
	hook?: boolean;
	requiresPruning?: boolean;
	liveState?: string;
	targetState?: string;
	diff?: string;
	normalizedLiveState?: string;
	predictedLiveState?: string;
}

export interface LogLine {
	content: string;
	timeStamp?: string;
	podName?: string;
	last?: boolean;
}

export interface ResourceSelector {
	appName: string;
	kind: string;
	namespace: string;
	name: string;
	group?: string;
	version?: string;
	uid?: string;
}

interface CachedData {
	ts: number;
	applications: ArgoApplication[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'cache:argo:applications';
const CACHE_TTL_MS = 60 * 1000;
const PROXY_BASE = '/dashboard/argo/proxy';
const REFRESH_INTERVAL_MS = 30 * 1000;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

class AccessRestrictedError extends Error {
	constructor() {
		super('Access restricted');
		this.name = 'AccessRestrictedError';
	}
}

class UpstreamUnavailableError extends Error {
	reason: string;
	detail: string;
	constructor(reason: string, detail: string) {
		super(`ArgoCD upstream unreachable: ${reason}`);
		this.name = 'UpstreamUnavailableError';
		this.reason = reason;
		this.detail = detail;
	}
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchApplications(token: string): Promise<ArgoApplication[]> {
	const resp = await fetch(`${PROXY_BASE}/api/v1/applications`, {
		headers: { Authorization: `Bearer ${token}` },
		signal: AbortSignal.timeout(10000),
	});

	if (resp.status === 403) throw new AccessRestrictedError();
	if (resp.status === 502) {
		try {
			const body = await resp.json();
			throw new UpstreamUnavailableError(
				body.reason ?? 'unknown',
				body.detail ?? '',
			);
		} catch (e) {
			if (e instanceof UpstreamUnavailableError) throw e;
			throw new UpstreamUnavailableError('unknown', 'Bad gateway');
		}
	}
	if (!resp.ok) throw new Error(`ArgoCD API error: ${resp.status}`);

	const data = await resp.json();
	return data.items ?? [];
}

export async function fetchResourceTree(
	token: string,
	appName: string,
): Promise<ResourceTree> {
	const resp = await fetch(
		`${PROXY_BASE}/api/v1/applications/${encodeURIComponent(appName)}/resource-tree`,
		{
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(10000),
		},
	);

	if (resp.status === 403) throw new AccessRestrictedError();
	if (!resp.ok) throw new Error(`ArgoCD API error: ${resp.status}`);

	return await resp.json();
}

export async function fetchLiveResource(
	token: string,
	sel: ResourceSelector,
): Promise<Record<string, unknown>> {
	const params = new URLSearchParams({
		namespace: sel.namespace,
		resourceName: sel.name,
		kind: sel.kind,
		version: sel.version ?? 'v1',
		group: sel.group ?? '',
	});
	const resp = await fetch(
		`${PROXY_BASE}/api/v1/applications/${encodeURIComponent(sel.appName)}/resource?${params}`,
		{
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(15000),
		},
	);

	if (resp.status === 403) throw new AccessRestrictedError();
	if (resp.status === 404)
		throw new Error('Resource not found in cluster (may be Missing)');
	if (!resp.ok) throw new Error(`ArgoCD API error: ${resp.status}`);

	const body = await resp.json();
	const raw = body?.manifest;
	if (typeof raw !== 'string')
		throw new Error('Unexpected response: missing manifest');
	try {
		return JSON.parse(raw) as Record<string, unknown>;
	} catch {
		throw new Error('Failed to parse manifest JSON');
	}
}

export async function fetchAppEvents(
	token: string,
	appName: string,
	resourceFilter?: {
		uid?: string;
		namespace?: string;
		name?: string;
		kind?: string;
	},
): Promise<AppEvent[]> {
	const params = new URLSearchParams();
	if (resourceFilter?.uid) params.set('resourceUID', resourceFilter.uid);
	if (resourceFilter?.namespace)
		params.set('resourceNamespace', resourceFilter.namespace);
	if (resourceFilter?.name) params.set('resourceName', resourceFilter.name);
	const qs = params.toString();
	const resp = await fetch(
		`${PROXY_BASE}/api/v1/applications/${encodeURIComponent(appName)}/events${qs ? `?${qs}` : ''}`,
		{
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(10000),
		},
	);

	if (resp.status === 403) throw new AccessRestrictedError();
	if (!resp.ok) throw new Error(`ArgoCD API error: ${resp.status}`);

	const body = await resp.json();
	return Array.isArray(body?.items) ? (body.items as AppEvent[]) : [];
}

export async function fetchManagedResources(
	token: string,
	appName: string,
): Promise<ManagedResource[]> {
	const resp = await fetch(
		`${PROXY_BASE}/api/v1/applications/${encodeURIComponent(appName)}/managed-resources`,
		{
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(15000),
		},
	);

	if (resp.status === 403) throw new AccessRestrictedError();
	if (!resp.ok) throw new Error(`ArgoCD API error: ${resp.status}`);

	const body = await resp.json();
	return Array.isArray(body?.items) ? (body.items as ManagedResource[]) : [];
}

export async function fetchPodLogs(
	token: string,
	appName: string,
	podName: string,
	opts: {
		namespace: string;
		container?: string;
		tailLines?: number;
		sinceSeconds?: number;
	},
): Promise<LogLine[]> {
	const params = new URLSearchParams({
		namespace: opts.namespace,
		podName: podName,
		tailLines: String(opts.tailLines ?? 200),
		follow: 'false',
	});
	if (opts.container) params.set('container', opts.container);
	if (opts.sinceSeconds)
		params.set('sinceSeconds', String(opts.sinceSeconds));

	const resp = await fetch(
		`${PROXY_BASE}/api/v1/applications/${encodeURIComponent(appName)}/pods/${encodeURIComponent(podName)}/logs?${params}`,
		{
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(20000),
		},
	);

	if (resp.status === 403) throw new AccessRestrictedError();
	if (resp.status === 404) throw new Error('Pod not found');
	if (!resp.ok) throw new Error(`ArgoCD API error: ${resp.status}`);

	const text = await resp.text();
	const lines: LogLine[] = [];
	for (const raw of text.split('\n')) {
		if (!raw.trim()) continue;
		try {
			const parsed = JSON.parse(raw);
			if (parsed?.result) lines.push(parsed.result as LogLine);
		} catch {
			lines.push({ content: raw });
		}
	}
	return lines;
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

function saveCache(applications: ArgoApplication[]): void {
	try {
		const data: CachedData = { ts: Date.now(), applications };
		localStorage.setItem(CACHE_KEY, JSON.stringify(data));
	} catch {
		// ignore quota errors
	}
}

// ---------------------------------------------------------------------------
// Status helpers (exported for islands)
// ---------------------------------------------------------------------------

export function healthColor(status: string): string {
	switch (status) {
		case 'Healthy':
			return '#22c55e';
		case 'Degraded':
			return '#ef4444';
		case 'Progressing':
			return '#f59e0b';
		case 'Suspended':
			return '#6b7280';
		case 'Missing':
			return '#ef4444';
		default:
			return '#6b7280';
	}
}

export function syncColor(status: string): string {
	switch (status) {
		case 'Synced':
			return '#22c55e';
		case 'OutOfSync':
			return '#f59e0b';
		default:
			return '#6b7280';
	}
}

export const STALL_THRESHOLD_MS = 5 * 60 * 1000;

export interface StallReason {
	reason: string;
	ageMs: number;
}

export function detectAppStall(app: ArgoApplication): StallReason | null {
	const op = app.status.operationState;
	if (op && op.phase === 'Running' && op.startedAt) {
		const ageMs = Date.now() - new Date(op.startedAt).getTime();
		if (ageMs >= STALL_THRESHOLD_MS) {
			return { reason: 'Sync running', ageMs };
		}
	}
	if (app.status.health.status === 'Progressing' && app.status.reconciledAt) {
		const ageMs = Date.now() - new Date(app.status.reconciledAt).getTime();
		if (ageMs >= STALL_THRESHOLD_MS) {
			return { reason: 'Progressing', ageMs };
		}
	}
	if (app.status.sync.status === 'OutOfSync' && app.status.reconciledAt) {
		const ageMs = Date.now() - new Date(app.status.reconciledAt).getTime();
		if (ageMs >= 30 * 60 * 1000) {
			return { reason: 'OutOfSync', ageMs };
		}
	}
	return null;
}

export function detectResourceStall(node: ResourceNode): StallReason | null {
	if (node.health?.status === 'Progressing' && node.createdAt) {
		const ageMs = Date.now() - new Date(node.createdAt).getTime();
		if (ageMs >= STALL_THRESHOLD_MS) {
			return { reason: 'Progressing', ageMs };
		}
	}
	if (node.health?.status === 'Degraded') {
		return { reason: 'Degraded', ageMs: 0 };
	}
	if (node.health?.status === 'Missing') {
		return { reason: 'Missing', ageMs: 0 };
	}
	return null;
}

export function formatAge(ageMs: number): string {
	if (ageMs < 60 * 1000) return `${Math.floor(ageMs / 1000)}s`;
	if (ageMs < 60 * 60 * 1000) return `${Math.floor(ageMs / 60000)}m`;
	if (ageMs < 24 * 60 * 60 * 1000) return `${Math.floor(ageMs / 3600000)}h`;
	return `${Math.floor(ageMs / 86400000)}d`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class ArgoService {
	// Auth
	public readonly $authState = atom<AuthState>('loading');
	public readonly $accessToken = atom<string | null>(null);

	// Data
	public readonly $applications = atom<ArgoApplication[]>([]);
	public readonly $loading = atom<boolean>(true);
	public readonly $error = atom<string | null>(null);
	public readonly $errorReason = atom<string | null>(null);
	public readonly $lastUpdated = atom<Date | null>(null);
	public readonly $expandedApp = atom<string | null>(null);
	public readonly $selectedResource = atom<ResourceSelector | null>(null);
	public readonly $appTab = atom<'resources' | 'events' | 'history'>(
		'resources',
	);

	// Computed
	public readonly $totalApps = computed(
		[this.$applications],
		(apps) => apps.length,
	);

	public readonly $healthyCount = computed(
		[this.$applications],
		(apps) =>
			apps.filter((a) => a.status.health.status === 'Healthy').length,
	);

	public readonly $syncedCount = computed(
		[this.$applications],
		(apps) => apps.filter((a) => a.status.sync.status === 'Synced').length,
	);

	public readonly $degradedCount = computed(
		[this.$applications],
		(apps) =>
			apps.filter(
				(a) =>
					a.status.health.status === 'Degraded' ||
					a.status.health.status === 'Missing',
			).length,
	);

	public readonly $outOfSyncCount = computed(
		[this.$applications],
		(apps) =>
			apps.filter((a) => a.status.sync.status === 'OutOfSync').length,
	);

	public readonly $stalledApps = computed([this.$applications], (apps) =>
		apps
			.map((a) => ({ app: a, stall: detectAppStall(a) }))
			.filter(
				(x): x is { app: ArgoApplication; stall: StallReason } =>
					x.stall !== null,
			),
	);

	public readonly $stalledCount = computed(
		[this.$stalledApps],
		(s) => s.length,
	);

	private _refreshInterval: ReturnType<typeof setInterval> | undefined;

	// --- Auth ---

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

	// --- Data fetching ---

	public async fetchData(): Promise<void> {
		const token = this.$accessToken.get();
		if (!token) return;

		try {
			this.$error.set(null);
			this.$errorReason.set(null);
			const apps = await fetchApplications(token);
			this.$applications.set(apps);
			this.$lastUpdated.set(new Date());
			saveCache(apps);
		} catch (e: unknown) {
			if (e instanceof AccessRestrictedError) {
				this.$authState.set('forbidden');
				return;
			}
			if (e instanceof UpstreamUnavailableError) {
				this.$error.set(e.message);
				this.$errorReason.set(e.reason);
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
			this.$applications.set(cached.applications);
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

	public toggleExpandedApp(name: string): void {
		if (this.$expandedApp.get() === name) {
			this.$expandedApp.set(null);
			this.$selectedResource.set(null);
		} else {
			this.$expandedApp.set(name);
			this.$appTab.set('resources');
			this.$selectedResource.set(null);
		}
	}

	public selectResource(sel: ResourceSelector | null): void {
		const cur = this.$selectedResource.get();
		if (
			sel &&
			cur &&
			cur.appName === sel.appName &&
			cur.kind === sel.kind &&
			cur.namespace === sel.namespace &&
			cur.name === sel.name
		) {
			this.$selectedResource.set(null);
		} else {
			this.$selectedResource.set(sel);
		}
	}

	public setAppTab(tab: 'resources' | 'events' | 'history'): void {
		this.$appTab.set(tab);
	}

	private _startAutoRefresh(): void {
		if (this._refreshInterval) clearInterval(this._refreshInterval);
		this._refreshInterval = setInterval(
			() => this.fetchData(),
			REFRESH_INTERVAL_MS,
		);
	}
}

export const argoService = new ArgoService();
