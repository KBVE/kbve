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
	health?: {
		status: string;
		message?: string;
	};
}

export interface ResourceTree {
	nodes: ResourceNode[];
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
		} else {
			this.$expandedApp.set(name);
		}
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
