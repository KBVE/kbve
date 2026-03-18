import { atom, computed } from 'nanostores';
import { initSupa, getSupa } from '@/lib/supa';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthState = 'loading' | 'authenticated' | 'unauthenticated';
export type ServiceStatus = 'ok' | 'error' | 'loading' | 'unavailable';

export interface GrafanaSummary {
	nodeCount: number;
	cpuPercent: number | null;
	memoryPercent: number | null;
	podCount: number | null;
}

export interface ArgoSummary {
	totalApps: number;
	healthyCount: number;
	syncedCount: number;
	degradedCount: number;
}

export interface EdgeSummary {
	operational: number;
	total: number;
	latencyMs: number;
}

export interface ClickHouseSummary {
	totalLogs: number;
	errors: number;
	warns: number;
	namespaces: number;
}

export interface SecuritySummary {
	generated_at: string;
	critical: number;
	high: number;
	medium: number;
	low: number;
	total: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPABASE_URL = 'https://supabase.kbve.com';
const CACHE_TTL_MS = 2 * 60 * 1000;
const PROXY_BASE = '/dashboard/grafana/proxy';
const DS_CACHE_KEY = 'cache:grafana:ds-id';
const CH_PROXY_BASE = '/dashboard/clickhouse/proxy';

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

interface CachedData<T> {
	data: T;
	cached_at: number;
}

function getCache<T>(key: string): T | null {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const cached: CachedData<T> = JSON.parse(raw);
		if (Date.now() - cached.cached_at > CACHE_TTL_MS) return null;
		return cached.data;
	} catch {
		return null;
	}
}

function setCache<T>(key: string, data: T): void {
	try {
		localStorage.setItem(
			key,
			JSON.stringify({ data, cached_at: Date.now() }),
		);
	} catch {
		/* quota exceeded */
	}
}

// ---------------------------------------------------------------------------
// Grafana datasource discovery
// ---------------------------------------------------------------------------

async function findPrometheusDatasourceId(
	token: string,
): Promise<number | null> {
	try {
		const cached = localStorage.getItem(DS_CACHE_KEY);
		if (cached) return parseInt(cached, 10);
	} catch {
		/* ignore */
	}

	try {
		const resp = await fetch(`${PROXY_BASE}/api/datasources`, {
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(8000),
		});
		if (!resp.ok) return null;
		const sources: Array<{ id: number; type: string; name: string }> =
			await resp.json();
		const prom = sources.find(
			(s) => s.type === 'prometheus' || s.name === 'Prometheus',
		);
		if (!prom) return null;
		try {
			localStorage.setItem(DS_CACHE_KEY, String(prom.id));
		} catch {
			/* ignore */
		}
		return prom.id;
	} catch {
		return null;
	}
}

async function queryInstant(
	token: string,
	dsId: number,
	expr: string,
): Promise<number | null> {
	try {
		const resp = await fetch(
			`${PROXY_BASE}/api/datasources/proxy/${dsId}/api/v1/query`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: `query=${encodeURIComponent(expr)}`,
				signal: AbortSignal.timeout(8000),
			},
		);
		if (!resp.ok) return null;
		const data = await resp.json();
		const val = data?.data?.result?.[0]?.value?.[1];
		return val != null ? parseFloat(val) : null;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchGrafanaSummary(
	token: string,
): Promise<GrafanaSummary | null> {
	const cached = getCache<GrafanaSummary>('cache:dashboard:grafana-summary');
	if (cached) return cached;

	try {
		const dsId = await findPrometheusDatasourceId(token);
		if (!dsId) return null;

		const [nodeCount, cpuPercent, memoryPercent, podCount] =
			await Promise.all([
				queryInstant(token, dsId, 'count(up{job="node-exporter"})'),
				queryInstant(
					token,
					dsId,
					'avg(100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100))',
				),
				queryInstant(
					token,
					dsId,
					'(1 - (sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes))) * 100',
				),
				queryInstant(
					token,
					dsId,
					'sum(kube_pod_status_phase{phase="Running"})',
				),
			]);

		if (nodeCount == null) return null;

		const summary: GrafanaSummary = {
			nodeCount: Math.round(nodeCount),
			cpuPercent:
				cpuPercent != null ? Math.round(cpuPercent * 10) / 10 : null,
			memoryPercent:
				memoryPercent != null
					? Math.round(memoryPercent * 10) / 10
					: null,
			podCount: podCount != null ? Math.round(podCount) : null,
		};
		setCache('cache:dashboard:grafana-summary', summary);
		return summary;
	} catch {
		return null;
	}
}

async function fetchArgoSummary(token: string): Promise<ArgoSummary | null> {
	const cached = getCache<ArgoSummary>('cache:dashboard:argo-summary');
	if (cached) return cached;

	try {
		const resp = await fetch('/dashboard/argo/proxy/api/v1/applications', {
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(8000),
		});
		if (!resp.ok) return null;
		const json = await resp.json();
		const items = json?.items ?? [];
		const totalApps = items.length;
		const healthyCount = items.filter(
			(a: any) => a.status?.health?.status === 'Healthy',
		).length;
		const syncedCount = items.filter(
			(a: any) => a.status?.sync?.status === 'Synced',
		).length;
		const degradedCount = items.filter(
			(a: any) =>
				a.status?.health?.status === 'Degraded' ||
				a.status?.health?.status === 'Missing',
		).length;
		const summary = { totalApps, healthyCount, syncedCount, degradedCount };
		setCache('cache:dashboard:argo-summary', summary);
		return summary;
	} catch {
		return null;
	}
}

async function fetchEdgeSummary(): Promise<EdgeSummary | null> {
	const cached = getCache<EdgeSummary>('cache:dashboard:edge-summary');
	if (cached) return cached;

	const functions = [
		'health',
		'meme',
		'mc',
		'discordsh',
		'user-vault',
		'guild-vault',
		'vault-reader',
	];
	const total = functions.length;
	const start = performance.now();

	try {
		const results = await Promise.allSettled(
			functions.map(async (fn) => {
				const method = fn === 'health' ? 'GET' : 'OPTIONS';
				const resp = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
					method,
					signal: AbortSignal.timeout(8000),
				});
				return resp.ok;
			}),
		);
		const operational = results.filter(
			(r) => r.status === 'fulfilled' && r.value,
		).length;
		const latencyMs = Math.round(performance.now() - start);
		const summary = { operational, total, latencyMs };
		setCache('cache:dashboard:edge-summary', summary);
		return summary;
	} catch {
		return null;
	}
}

async function fetchClickHouseSummary(
	token: string,
): Promise<ClickHouseSummary | null> {
	const cached = getCache<ClickHouseSummary>('cache:dashboard:ch-summary');
	if (cached) return cached;

	try {
		const resp = await fetch(CH_PROXY_BASE, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ command: 'stats', minutes: 60 }),
			signal: AbortSignal.timeout(10000),
		});
		if (!resp.ok) return null;
		const data = await resp.json();
		const rows: Array<{
			pod_namespace: string;
			level: string;
			cnt: string;
		}> = data.rows ?? [];

		let totalLogs = 0;
		let errors = 0;
		let warns = 0;
		const ns = new Set<string>();
		for (const r of rows) {
			const cnt = parseInt(r.cnt, 10);
			totalLogs += cnt;
			if (r.level === 'error') errors += cnt;
			if (r.level === 'warn') warns += cnt;
			ns.add(r.pod_namespace);
		}

		const summary = { totalLogs, errors, warns, namespaces: ns.size };
		setCache('cache:dashboard:ch-summary', summary);
		return summary;
	} catch {
		return null;
	}
}

async function fetchSecuritySummary(): Promise<SecuritySummary | null> {
	const cached = getCache<SecuritySummary>(
		'cache:dashboard:security-summary',
	);
	if (cached) return cached;

	try {
		const resp = await fetch('/data/nx/nx-security.json', {
			signal: AbortSignal.timeout(8000),
		});
		if (!resp.ok) return null;
		const data = await resp.json();
		const s = data?.summary;
		if (!s) return null;

		const summary: SecuritySummary = {
			generated_at: data.generated_at ?? '',
			critical: s.critical ?? 0,
			high: s.high ?? 0,
			medium: s.medium ?? 0,
			low: s.low ?? 0,
			total:
				(s.critical ?? 0) +
				(s.high ?? 0) +
				(s.medium ?? 0) +
				(s.low ?? 0) +
				(s.info ?? 0),
		};
		setCache('cache:dashboard:security-summary', summary);
		return summary;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Status helpers (exported for islands)
// ---------------------------------------------------------------------------

export function statusColor(status: ServiceStatus): string {
	switch (status) {
		case 'ok':
			return '#22c55e';
		case 'error':
			return '#ef4444';
		case 'loading':
			return '#94a3b8';
		case 'unavailable':
			return '#f59e0b';
	}
}

export function statusLabel(status: ServiceStatus): string {
	switch (status) {
		case 'ok':
			return 'Operational';
		case 'error':
			return 'Down';
		case 'loading':
			return 'Checking...';
		case 'unavailable':
			return 'Unavailable';
	}
}

export function getThresholdColor(value: number): string {
	if (value >= 85) return '#ef4444';
	if (value >= 70) return '#eab308';
	return '#22c55e';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class HomeService {
	// Auth
	public readonly $authState = atom<AuthState>('loading');
	public readonly $accessToken = atom<string | null>(null);

	// Data
	public readonly $grafana = atom<GrafanaSummary | null>(null);
	public readonly $argo = atom<ArgoSummary | null>(null);
	public readonly $edge = atom<EdgeSummary | null>(null);
	public readonly $clickhouse = atom<ClickHouseSummary | null>(null);
	public readonly $security = atom<SecuritySummary | null>(null);

	// Loading
	public readonly $loading = atom<boolean>(true);
	public readonly $lastUpdated = atom<Date | null>(null);

	// Per-service status
	public readonly $grafanaStatus = atom<ServiceStatus>('loading');
	public readonly $argoStatus = atom<ServiceStatus>('loading');
	public readonly $edgeStatus = atom<ServiceStatus>('loading');
	public readonly $clickhouseStatus = atom<ServiceStatus>('loading');
	public readonly $securityStatus = atom<ServiceStatus>('loading');

	// Computed
	public readonly $allOk = computed(
		[
			this.$grafanaStatus,
			this.$argoStatus,
			this.$edgeStatus,
			this.$clickhouseStatus,
			this.$securityStatus,
		],
		(g, a, e, c, s) =>
			g === 'ok' && a === 'ok' && e === 'ok' && c === 'ok' && s === 'ok',
	);

	public readonly $anyError = computed(
		[
			this.$grafanaStatus,
			this.$argoStatus,
			this.$edgeStatus,
			this.$clickhouseStatus,
		],
		(g, a, e, c) =>
			g === 'error' || a === 'error' || e === 'error' || c === 'error',
	);

	public readonly $anyLoading = computed(
		[
			this.$grafanaStatus,
			this.$argoStatus,
			this.$edgeStatus,
			this.$clickhouseStatus,
			this.$securityStatus,
		],
		(g, a, e, c, s) =>
			g === 'loading' ||
			a === 'loading' ||
			e === 'loading' ||
			c === 'loading' ||
			s === 'loading',
	);

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

	public async fetchAll(): Promise<void> {
		this.$loading.set(true);
		this.$grafanaStatus.set('loading');
		this.$argoStatus.set('loading');
		this.$edgeStatus.set('loading');
		this.$clickhouseStatus.set('loading');
		this.$securityStatus.set('loading');

		const token = this.$accessToken.get();

		const edgePromise = fetchEdgeSummary().then((e) => {
			this.$edge.set(e);
			this.$edgeStatus.set(e ? 'ok' : 'unavailable');
		});

		const securityPromise = fetchSecuritySummary().then((s) => {
			this.$security.set(s);
			this.$securityStatus.set(s ? 'ok' : 'unavailable');
		});

		if (token) {
			const grafanaPromise = fetchGrafanaSummary(token).then((g) => {
				this.$grafana.set(g);
				this.$grafanaStatus.set(g ? 'ok' : 'unavailable');
			});

			const argoPromise = fetchArgoSummary(token).then((a) => {
				this.$argo.set(a);
				this.$argoStatus.set(a ? 'ok' : 'unavailable');
			});

			const clickhousePromise = fetchClickHouseSummary(token).then(
				(ch) => {
					this.$clickhouse.set(ch);
					this.$clickhouseStatus.set(ch ? 'ok' : 'unavailable');
				},
			);

			await Promise.all([
				grafanaPromise,
				argoPromise,
				edgePromise,
				clickhousePromise,
				securityPromise,
			]);
		} else {
			await Promise.all([edgePromise, securityPromise]);
		}

		this.$lastUpdated.set(new Date());
		this.$loading.set(false);
	}
}

export const homeService = new HomeService();
