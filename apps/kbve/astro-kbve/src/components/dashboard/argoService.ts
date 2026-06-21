import { atom, computed } from 'nanostores';
import { initSupa, getSupa } from '@/lib/supa';
import { cacheGet, cacheSet, cacheDel } from '@/lib/idb-cache';
import {
	HealthStatusCodes,
	SyncStatusCodes,
	AppSummarySchema,
	type HealthStatusCodeValue,
	type SyncStatusCodeValue,
	type AppSummary,
	type ResourceTally,
} from '@kbve/devops';

export type { AppSummary, ResourceTally } from '@kbve/devops';

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
			status: SyncStatusCodeValue;
			revision?: string;
		};
		health: {
			status: HealthStatusCodeValue;
			message?: string;
		};
		operationState?: {
			phase: string;
			message?: string;
			finishedAt?: string;
			startedAt?: string;
		};
		reconciledAt?: string;
		resources?: AppResourceStatus[];
	};
}

export interface AppResourceStatus {
	group?: string;
	version?: string;
	kind: string;
	namespace?: string;
	name: string;
	status?: SyncStatusCodeValue;
	health?: {
		status?: HealthStatusCodeValue;
		message?: string;
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'argo:applications';
const CACHE_TTL_MS = 60 * 1000;
const PROXY_BASE = '/dashboard/argo/proxy';
const REFRESH_INTERVAL_MS = 30 * 1000;
const REFRESH_DEBOUNCE_MS = 500;

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
// Mutations (gated by DASHBOARD_MANAGE in the axum proxy)
// ---------------------------------------------------------------------------

export class ManageForbiddenError extends Error {
	constructor() {
		super('Requires DASHBOARD_MANAGE permission');
		this.name = 'ManageForbiddenError';
	}
}

export async function syncApplication(
	token: string,
	appName: string,
): Promise<void> {
	const resp = await fetch(
		`${PROXY_BASE}/api/v1/applications/${encodeURIComponent(appName)}/sync`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ prune: false }),
			signal: AbortSignal.timeout(20000),
		},
	);
	if (resp.status === 403) throw new ManageForbiddenError();
	if (!resp.ok) throw new Error(`Sync failed: ${resp.status}`);
}

export async function hardRefreshApplication(
	token: string,
	appName: string,
): Promise<void> {
	const resp = await fetch(
		`${PROXY_BASE}/api/v1/applications/${encodeURIComponent(appName)}?refresh=hard`,
		{
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(20000),
		},
	);
	if (resp.status === 403) throw new AccessRestrictedError();
	if (!resp.ok) throw new Error(`Refresh failed: ${resp.status}`);
}

export async function rollbackApplication(
	token: string,
	appName: string,
	id: number,
): Promise<void> {
	const resp = await fetch(
		`${PROXY_BASE}/api/v1/applications/${encodeURIComponent(appName)}/rollback`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ id, prune: false, dryRun: false }),
			signal: AbortSignal.timeout(30000),
		},
	);
	if (resp.status === 403) throw new ManageForbiddenError();
	if (!resp.ok) throw new Error(`Rollback failed: ${resp.status}`);
}

// ---------------------------------------------------------------------------
// Diff helpers — readable live-vs-target comparison for OutOfSync resources.
// ArgoCD's managed-resources endpoint returns JSON manifests as strings; we
// pretty-print with stable key ordering, then run a line LCS to mark changes.
// ---------------------------------------------------------------------------

export type AppTab = 'resources' | 'diff' | 'events' | 'history';

export type DiffLineOp = 'context' | 'add' | 'remove';

export interface DiffLine {
	op: DiffLineOp;
	text: string;
}

function stableStringify(value: unknown): string {
	const seen = new WeakSet();
	const sort = (v: unknown): unknown => {
		if (v === null || typeof v !== 'object') return v;
		if (seen.has(v as object)) return undefined;
		seen.add(v as object);
		if (Array.isArray(v)) return v.map(sort);
		const out: Record<string, unknown> = {};
		for (const k of Object.keys(v as Record<string, unknown>).sort()) {
			out[k] = sort((v as Record<string, unknown>)[k]);
		}
		return out;
	};
	return JSON.stringify(sort(value), null, 2);
}

export function prettyManifest(raw: string | undefined): string {
	if (!raw) return '';
	try {
		return stableStringify(JSON.parse(raw));
	} catch {
		return raw;
	}
}

/**
 * Minimal line diff via longest-common-subsequence. Manifests are small
 * (typically <500 lines) so the O(n·m) DP table is fine.
 */
export function diffLines(before: string, after: string): DiffLine[] {
	const a = before ? before.split('\n') : [];
	const b = after ? after.split('\n') : [];
	const n = a.length;
	const m = b.length;
	const lcs: number[][] = Array.from({ length: n + 1 }, () =>
		new Array<number>(m + 1).fill(0),
	);
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			lcs[i][j] =
				a[i] === b[j]
					? lcs[i + 1][j + 1] + 1
					: Math.max(lcs[i + 1][j], lcs[i][j + 1]);
		}
	}
	const out: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			out.push({ op: 'context', text: a[i] });
			i++;
			j++;
		} else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
			out.push({ op: 'remove', text: a[i] });
			i++;
		} else {
			out.push({ op: 'add', text: b[j] });
			j++;
		}
	}
	while (i < n) out.push({ op: 'remove', text: a[i++] });
	while (j < m) out.push({ op: 'add', text: b[j++] });
	return out;
}

// ---------------------------------------------------------------------------
// Cache helpers — IndexedDB-backed (SharedWorker → Dexie → localStorage →
// memory) via the shared idb-cache layer. Render from here first, then pull.
// ---------------------------------------------------------------------------

function loadCache(): Promise<ArgoApplication[] | null> {
	return cacheGet<ArgoApplication[]>(CACHE_KEY, CACHE_TTL_MS);
}

function saveCache(applications: ArgoApplication[]): void {
	void cacheSet(CACHE_KEY, applications);
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

/**
 * Pick the most-actionable unhealthy node in a resource tree: Degraded first,
 * then Missing, then Progressing; within a tier prefer a Pod (the leaf you can
 * read logs / metrics on).
 */
export function pickFailingNode(nodes: ResourceNode[]): ResourceNode | null {
	const rank = (n: ResourceNode): number => {
		switch (n.health?.status) {
			case 'Degraded':
				return 0;
			case 'Missing':
				return 1;
			case 'Progressing':
				return 2;
			default:
				return 9;
		}
	};
	const candidates = nodes
		.filter((n) => rank(n) < 9)
		.sort((a, b) => {
			const r = rank(a) - rank(b);
			if (r !== 0) return r;
			return (a.kind === 'Pod' ? 0 : 1) - (b.kind === 'Pod' ? 0 : 1);
		});
	return candidates[0] ?? null;
}

export function formatAge(ageMs: number): string {
	if (ageMs < 60 * 1000) return `${Math.floor(ageMs / 1000)}s`;
	if (ageMs < 60 * 60 * 1000) return `${Math.floor(ageMs / 60000)}m`;
	if (ageMs < 24 * 60 * 60 * 1000) return `${Math.floor(ageMs / 3600000)}h`;
	return `${Math.floor(ageMs / 86400000)}d`;
}

// ---------------------------------------------------------------------------
// Proto projection — raw ArgoCD application → typed AppSummary (the card view).
// Cards render from this; the raw payload stays for the deep panels. Validated
// against the generated zod schema in dev so silent API drift surfaces loudly.
// ---------------------------------------------------------------------------

const HEALTH_SET = new Set<string>(HealthStatusCodes);
const SYNC_SET = new Set<string>(SyncStatusCodes);

function asHealth(s: string | undefined): HealthStatusCodeValue {
	return s && HEALTH_SET.has(s) ? (s as HealthStatusCodeValue) : 'Unknown';
}

function asSync(s: string | undefined): SyncStatusCodeValue {
	return s && SYNC_SET.has(s) ? (s as SyncStatusCodeValue) : 'Unknown';
}

function tallyResources(resources?: AppResourceStatus[]): ResourceTally {
	const t: ResourceTally = {
		total: 0,
		healthy: 0,
		degraded: 0,
		progressing: 0,
		missing: 0,
		suspended: 0,
		synced: 0,
		out_of_sync: 0,
	};
	for (const r of resources ?? []) {
		t.total += 1;
		switch (asHealth(r.health?.status)) {
			case 'Healthy':
				t.healthy += 1;
				break;
			case 'Degraded':
				t.degraded += 1;
				break;
			case 'Progressing':
				t.progressing += 1;
				break;
			case 'Missing':
				t.missing += 1;
				break;
			case 'Suspended':
				t.suspended += 1;
				break;
		}
		if (asSync(r.status) === 'Synced') t.synced += 1;
		else if (asSync(r.status) === 'OutOfSync') t.out_of_sync += 1;
	}
	return t;
}

export function normalizeApp(app: ArgoApplication): AppSummary {
	const op = app.status.operationState;
	const stall = detectAppStall(app);
	const summary: AppSummary = {
		name: app.metadata.name,
		namespace: app.spec.destination.namespace || '',
		project: app.spec.project,
		health: {
			status: asHealth(app.status.health.status),
			message: app.status.health.message ?? '',
		},
		sync: {
			status: asSync(app.status.sync.status),
			revision: app.status.sync.revision ?? '',
		},
		repo_url: app.spec.source?.repoURL ?? '',
		target_revision: app.spec.source?.targetRevision ?? '',
		path: app.spec.source?.path ?? '',
		revision: (app.status.sync.revision ?? '').slice(0, 7),
		created_at: app.metadata.creationTimestamp ?? '',
		reconciled_at: app.status.reconciledAt ?? '',
		last_sync_at: op?.finishedAt ?? '',
		operation_phase: op?.phase ?? '',
		operation_message: op?.message ?? '',
		resources: tallyResources(app.status.resources),
		stalled: stall !== null,
		stall_reason: stall?.reason ?? '',
		stall_age_ms: stall?.ageMs ?? 0,
	};
	if (import.meta.env?.DEV) {
		const parsed = AppSummarySchema.safeParse(summary);
		if (!parsed.success) {
			console.warn(
				`[argo] AppSummary drift for ${summary.name}:`,
				parsed.error.issues,
			);
		}
	}
	return summary;
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
	public readonly $appTab = atom<AppTab>('resources');

	// Per-app action state: $actionBusy holds `${name}:sync` | `${name}:refresh`
	// while the request is in flight; messages are transient banners.
	public readonly $actionBusy = atom<string | null>(null);
	public readonly $actionError = atom<string | null>(null);
	public readonly $actionMsg = atom<string | null>(null);

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

	public readonly $degradedApps = computed([this.$applications], (apps) =>
		apps.filter(
			(a) =>
				a.status.health.status === 'Degraded' ||
				a.status.health.status === 'Missing',
		),
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

	// Typed card projection (proto AppSummary), sorted worst-health-first so
	// the grid surfaces what needs attention at the top.
	public readonly $appSummaries = computed([this.$applications], (apps) => {
		const rank = (h: HealthStatusCodeValue): number => {
			switch (h) {
				case 'Degraded':
					return 0;
				case 'Missing':
					return 1;
				case 'Progressing':
					return 2;
				case 'Suspended':
					return 3;
				case 'Unknown':
					return 4;
				default:
					return 5;
			}
		};
		return apps
			.map(normalizeApp)
			.sort(
				(a, b) =>
					rank(a.health?.status ?? 'Unknown') -
					rank(b.health?.status ?? 'Unknown'),
			);
	});

	// View toggle: rich card grid (default) vs dense table rows.
	public readonly $viewMode = atom<'grid' | 'table'>('grid');

	private _refreshInterval: ReturnType<typeof setInterval> | undefined;
	private _refreshTimer: ReturnType<typeof setTimeout> | undefined;

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

	public async loadCacheAndFetch(): Promise<void> {
		const token = this.$accessToken.get();
		if (!token) return;

		const cached = await loadCache();
		if (cached && this.$applications.get().length === 0) {
			this.$applications.set(cached);
			this.$lastUpdated.set(new Date());
			this.$loading.set(false);
		}

		this._scheduleRefresh(true);
		this._startAutoRefresh();
	}

	public refresh(): void {
		const token = this.$accessToken.get();
		if (token) {
			this.$loading.set(true);
			this._scheduleRefresh();
		}
	}

	public async invalidateCache(): Promise<void> {
		await cacheDel(CACHE_KEY);
	}

	public async syncApp(name: string): Promise<void> {
		const token = this.$accessToken.get();
		if (!token || this.$actionBusy.get()) return;
		this.$actionBusy.set(`${name}:sync`);
		this.$actionError.set(null);
		this.$actionMsg.set(null);
		try {
			await syncApplication(token, name);
			this.$actionMsg.set(`Sync triggered for ${name}`);
			await this.invalidateCache();
			this._scheduleRefresh(true);
		} catch (e: unknown) {
			this.$actionError.set(
				e instanceof ManageForbiddenError
					? 'Sync needs DASHBOARD_MANAGE permission'
					: e instanceof Error
						? e.message
						: 'Sync failed',
			);
		} finally {
			this.$actionBusy.set(null);
		}
	}

	public async hardRefreshApp(name: string): Promise<void> {
		const token = this.$accessToken.get();
		if (!token || this.$actionBusy.get()) return;
		this.$actionBusy.set(`${name}:refresh`);
		this.$actionError.set(null);
		this.$actionMsg.set(null);
		try {
			await hardRefreshApplication(token, name);
			this.$actionMsg.set(`Hard refresh requested for ${name}`);
			await this.invalidateCache();
			this._scheduleRefresh(true);
		} catch (e: unknown) {
			this.$actionError.set(
				e instanceof Error ? e.message : 'Refresh failed',
			);
		} finally {
			this.$actionBusy.set(null);
		}
	}

	public async rollbackApp(name: string, id: number): Promise<void> {
		const token = this.$accessToken.get();
		if (!token || this.$actionBusy.get()) return;
		this.$actionBusy.set(`${name}:rollback`);
		this.$actionError.set(null);
		this.$actionMsg.set(null);
		try {
			await rollbackApplication(token, name, id);
			this.$actionMsg.set(`Rollback to revision #${id} triggered`);
			await this.invalidateCache();
			this._scheduleRefresh(true);
		} catch (e: unknown) {
			this.$actionError.set(
				e instanceof ManageForbiddenError
					? 'Rollback needs DASHBOARD_MANAGE permission'
					: e instanceof Error
						? e.message
						: 'Rollback failed',
			);
		} finally {
			this.$actionBusy.set(null);
		}
	}

	private _scheduleRefresh(immediate = false): void {
		if (this._refreshTimer) clearTimeout(this._refreshTimer);
		this._refreshTimer = setTimeout(
			() => {
				this._refreshTimer = undefined;
				void this.fetchData();
			},
			immediate ? 0 : REFRESH_DEBOUNCE_MS,
		);
	}

	public toggleExpandedApp(name: string): void {
		this.$actionError.set(null);
		this.$actionMsg.set(null);
		if (this.$expandedApp.get() === name) {
			this.$expandedApp.set(null);
			this.$selectedResource.set(null);
		} else {
			this.$expandedApp.set(name);
			this.$appTab.set('resources');
			this.$selectedResource.set(null);
		}
	}

	public async focusFailingResource(appName: string): Promise<void> {
		const token = this.$accessToken.get();
		if (this.$expandedApp.get() !== appName) {
			this.$actionError.set(null);
			this.$actionMsg.set(null);
			this.$expandedApp.set(appName);
		}
		this.$appTab.set('resources');
		this.$selectedResource.set(null);
		if (!token) return;
		try {
			const tree = await fetchResourceTree(token, appName);
			const bad = pickFailingNode(tree.nodes);
			if (bad) {
				this.$selectedResource.set({
					appName,
					kind: bad.kind,
					namespace: bad.namespace,
					name: bad.name,
					group: bad.group,
					version: bad.version,
					uid: bad.uid,
				});
			}
		} catch {
			/* leave the app expanded; tree fetch is best-effort */
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

	public setAppTab(tab: AppTab): void {
		this.$appTab.set(tab);
	}

	public setViewMode(mode: 'grid' | 'table'): void {
		this.$viewMode.set(mode);
	}

	private _startAutoRefresh(): void {
		if (this._refreshInterval) clearInterval(this._refreshInterval);
		this._refreshInterval = setInterval(
			() => this._scheduleRefresh(),
			REFRESH_INTERVAL_MS,
		);
	}
}

export const argoService = new ArgoService();
