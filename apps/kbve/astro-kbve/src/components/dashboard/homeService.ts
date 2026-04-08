import { atom, computed } from 'nanostores';
import { initSupa, getSupa } from '@/lib/supa';
import { $auth, AuthFlags, hasAuthFlag, addToast } from '@kbve/droid';

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

export interface KanbanSummary {
	generated_at: string;
	total_items: number;
	columns: Record<string, number>;
	done: number;
	active: number;
	error: number;
}

export interface ReportSummary {
	generated_at: string;
	node: string;
	nx: string;
	pnpm: string;
	os: string;
	totalFiles: number;
	totalLines: number;
	topLanguages: Array<{ name: string; lines: number }>;
}

export interface GraphSummary {
	totalProjects: number;
	apps: number;
	libs: number;
	e2e: number;
}

export interface RowsSummary {
	status: string;
	version: string;
	uptime_seconds: number;
	active_sessions: number;
	active_instances: number;
	checks: Record<string, { ok: boolean; latency_ms?: number }>;
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

	try {
		// Fetch function list from the health endpoint manifest
		// instead of hardcoding — the manifest is the source of truth.
		const manifestResp = await fetch(
			`${SUPABASE_URL}/functions/v1/health`,
			{ signal: AbortSignal.timeout(8000) },
		);
		if (!manifestResp.ok) return null;
		const manifest = await manifestResp.json();
		const functionNames: string[] = (manifest.functions ?? []).map(
			(f: { name: string }) => f.name,
		);
		if (functionNames.length === 0) return null;

		const total = functionNames.length;
		const start = performance.now();

		const results = await Promise.allSettled(
			functionNames.map(async (fn) => {
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

async function fetchKanbanSummary(): Promise<KanbanSummary | null> {
	const cached = getCache<KanbanSummary>('cache:dashboard:kanban-summary');
	if (cached) return cached;

	try {
		const resp = await fetch('/data/nx/nx-kanban.json', {
			signal: AbortSignal.timeout(8000),
		});
		if (!resp.ok) return null;
		const data = await resp.json();
		const cols: Record<string, number> = data?.summary ?? {};
		const done = cols['Done'] ?? 0;
		const error = cols['Error'] ?? 0;
		const active = Object.entries(cols)
			.filter(([k]) => k !== 'Done')
			.reduce((s, [, v]) => s + v, 0);

		const summary: KanbanSummary = {
			generated_at: data.generated_at ?? '',
			total_items: data.project?.total_items ?? 0,
			columns: cols,
			done,
			active,
			error,
		};
		setCache('cache:dashboard:kanban-summary', summary);
		return summary;
	} catch {
		return null;
	}
}

async function fetchReportSummary(): Promise<ReportSummary | null> {
	const cached = getCache<ReportSummary>('cache:dashboard:report-summary');
	if (cached) return cached;

	try {
		const resp = await fetch('/data/nx/nx-report.json', {
			signal: AbortSignal.timeout(8000),
		});
		if (!resp.ok) return null;
		const data = await resp.json();
		const env = data?.environment ?? {};

		// Parse LOC stats from scc output
		let totalFiles = 0;
		let totalLines = 0;
		const topLanguages: Array<{ name: string; lines: number }> = [];

		const locRaw: string = data?.loc_stats ?? '';
		if (locRaw) {
			const lines = locRaw.split('\n');
			for (const line of lines) {
				// scc output: Language, Files, Lines, Blanks, Comments, Code, Complexity
				const match = line.match(
					/^\s*(\S[\w\s#+.]+?)\s{2,}(\d+)\s+(\d+)\s+/,
				);
				if (match && match[1] !== 'Total' && match[1] !== 'Language') {
					const lang = match[1].trim();
					const files = parseInt(match[2], 10);
					const loc = parseInt(match[3], 10);
					totalFiles += files;
					totalLines += loc;
					topLanguages.push({ name: lang, lines: loc });
				}
				if (line.trim().startsWith('Total')) {
					const totalMatch = line.match(/Total\s+(\d+)\s+(\d+)/);
					if (totalMatch) {
						totalFiles = parseInt(totalMatch[1], 10);
						totalLines = parseInt(totalMatch[2], 10);
					}
				}
			}
		}

		topLanguages.sort((a, b) => b.lines - a.lines);

		const summary: ReportSummary = {
			generated_at: data.generated_at ?? '',
			node: env.node ?? '?',
			nx: env.nx ?? '?',
			pnpm: env.pnpm ?? '?',
			os: env.os ?? '?',
			totalFiles,
			totalLines,
			topLanguages: topLanguages.slice(0, 5),
		};
		setCache('cache:dashboard:report-summary', summary);
		return summary;
	} catch {
		return null;
	}
}

const ROWS_PROXY_BASE = '/dashboard/chuckrpg/proxy';

async function fetchRowsSummary(token: string): Promise<RowsSummary | null> {
	const cached = getCache<RowsSummary>('cache:dashboard:rows-summary');
	if (cached) return cached;

	try {
		const resp = await fetch(`${ROWS_PROXY_BASE}/api/System/Health`, {
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(8000),
		});
		if (!resp.ok) return null;
		const data: RowsSummary = await resp.json();
		setCache('cache:dashboard:rows-summary', data);
		return data;
	} catch {
		return null;
	}
}

async function fetchGraphSummary(): Promise<GraphSummary | null> {
	const cached = getCache<GraphSummary>('cache:dashboard:graph-summary');
	if (cached) return cached;

	try {
		const resp = await fetch('/data/nx/nx-graph.json', {
			signal: AbortSignal.timeout(8000),
		});
		if (!resp.ok) return null;
		const data = await resp.json();
		const nodes = data?.graph?.nodes ?? {};
		const entries = Object.values(nodes) as Array<{ type: string }>;

		const summary: GraphSummary = {
			totalProjects: entries.length,
			apps: entries.filter((n) => n.type === 'app').length,
			libs: entries.filter((n) => n.type === 'lib').length,
			e2e: entries.filter((n) => n.type === 'e2e').length,
		};
		setCache('cache:dashboard:graph-summary', summary);
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
	public readonly $isStaff = atom<boolean>(false);

	// Data
	public readonly $grafana = atom<GrafanaSummary | null>(null);
	public readonly $argo = atom<ArgoSummary | null>(null);
	public readonly $edge = atom<EdgeSummary | null>(null);
	public readonly $clickhouse = atom<ClickHouseSummary | null>(null);
	public readonly $security = atom<SecuritySummary | null>(null);
	public readonly $kanban = atom<KanbanSummary | null>(null);
	public readonly $report = atom<ReportSummary | null>(null);
	public readonly $graph = atom<GraphSummary | null>(null);
	public readonly $rows = atom<RowsSummary | null>(null);

	// Loading
	public readonly $loading = atom<boolean>(true);
	public readonly $lastUpdated = atom<Date | null>(null);

	// Per-service status
	public readonly $grafanaStatus = atom<ServiceStatus>('loading');
	public readonly $argoStatus = atom<ServiceStatus>('loading');
	public readonly $edgeStatus = atom<ServiceStatus>('loading');
	public readonly $clickhouseStatus = atom<ServiceStatus>('loading');
	public readonly $securityStatus = atom<ServiceStatus>('loading');
	public readonly $kanbanStatus = atom<ServiceStatus>('loading');
	public readonly $reportStatus = atom<ServiceStatus>('loading');
	public readonly $graphStatus = atom<ServiceStatus>('loading');
	public readonly $rowsStatus = atom<ServiceStatus>('loading');

	// Computed — staff-aware: exclude infrastructure services for regular users
	public readonly $allOk = computed(
		[
			this.$grafanaStatus,
			this.$argoStatus,
			this.$edgeStatus,
			this.$clickhouseStatus,
			this.$securityStatus,
			this.$rowsStatus,
			this.$isStaff,
		],
		(g, a, e, c, s, r, staff) =>
			e === 'ok' &&
			s === 'ok' &&
			(!staff || (g === 'ok' && a === 'ok' && c === 'ok' && r === 'ok')),
	);

	public readonly $anyError = computed(
		[
			this.$grafanaStatus,
			this.$argoStatus,
			this.$edgeStatus,
			this.$clickhouseStatus,
			this.$rowsStatus,
			this.$isStaff,
		],
		(g, a, e, c, r, staff) =>
			e === 'error' ||
			(staff &&
				(g === 'error' ||
					a === 'error' ||
					c === 'error' ||
					r === 'error')),
	);

	public readonly $anyLoading = computed(
		[
			this.$grafanaStatus,
			this.$argoStatus,
			this.$edgeStatus,
			this.$clickhouseStatus,
			this.$securityStatus,
			this.$rowsStatus,
			this.$isStaff,
		],
		(g, a, e, c, s, r, staff) =>
			e === 'loading' ||
			s === 'loading' ||
			(staff &&
				(g === 'loading' ||
					a === 'loading' ||
					c === 'loading' ||
					r === 'loading')),
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
				addToast({
					id: `auth-anon-${Date.now()}`,
					message: 'Please sign in to access the dashboard.',
					severity: 'info',
					duration: 4000,
				});
				return;
			}

			this.$accessToken.set(session.access_token as string);

			// Read staff flag from $auth — resolveStaffFlag() in supa.ts
			// already upgraded flags to STAFF during initSupa() if the
			// user has staff permissions.
			const { flags } = $auth.get();
			const isStaff = hasAuthFlag(flags, AuthFlags.STAFF);
			this.$isStaff.set(isStaff);

			this.$authState.set('authenticated');

			const authName = $auth.get().name;
			addToast({
				id: `auth-ok-${Date.now()}`,
				message: authName
					? `Welcome back, ${authName}`
					: 'Signed in successfully',
				severity: 'success',
				duration: 4000,
			});

			// Also subscribe in case profile-controller sets it later
			const syncStaff = () => {
				const { flags } = $auth.get();
				if (hasAuthFlag(flags, AuthFlags.STAFF)) {
					if (!this.$isStaff.get()) {
						this.$isStaff.set(true);
						addToast({
							id: `staff-ok-${Date.now()}`,
							message: 'Staff access enabled',
							severity: 'info',
							duration: 3000,
						});
					}
				}
			};
			$auth.subscribe(syncStaff);
		} catch {
			this.$authState.set('unauthenticated');
			addToast({
				id: `auth-err-${Date.now()}`,
				message: 'Session expired — please sign in again.',
				severity: 'warning',
				duration: 5000,
			});
		}
	}

	// --- Data fetching ---

	public async fetchAll(): Promise<void> {
		this.$loading.set(true);

		const token = this.$accessToken.get();
		// Re-check staff flag — it may have resolved after the initial auth.
		// The $auth subscription fires late, so we also check directly.
		let isStaff = this.$isStaff.get();
		if (!isStaff) {
			// Give the RPC a moment to resolve on first load
			const { flags } = $auth.get();
			isStaff = hasAuthFlag(flags, AuthFlags.STAFF);
			if (isStaff) this.$isStaff.set(true);
		}

		// User-visible services — always load
		this.$edgeStatus.set('loading');
		this.$securityStatus.set('loading');
		this.$kanbanStatus.set('loading');
		this.$reportStatus.set('loading');
		this.$graphStatus.set('loading');

		// Staff services — only load for staff, otherwise mark unavailable.
		// Clear stale 'unavailable' status when staff flag resolves late.
		if (isStaff) {
			this.$grafanaStatus.set('loading');
			this.$argoStatus.set('loading');
			this.$clickhouseStatus.set('loading');
			this.$rowsStatus.set('loading');
		} else {
			this.$grafanaStatus.set('unavailable');
			this.$argoStatus.set('unavailable');
			this.$clickhouseStatus.set('unavailable');
			this.$rowsStatus.set('unavailable');
		}

		// Static JSON fetches (no auth required)
		const edgePromise = fetchEdgeSummary().then((e) => {
			this.$edge.set(e);
			this.$edgeStatus.set(e ? 'ok' : 'unavailable');
		});

		const securityPromise = fetchSecuritySummary().then((s) => {
			this.$security.set(s);
			this.$securityStatus.set(s ? 'ok' : 'unavailable');
		});

		const kanbanPromise = fetchKanbanSummary().then((k) => {
			this.$kanban.set(k);
			this.$kanbanStatus.set(k ? 'ok' : 'unavailable');
		});

		const reportPromise = fetchReportSummary().then((r) => {
			this.$report.set(r);
			this.$reportStatus.set(r ? 'ok' : 'unavailable');
		});

		const graphPromise = fetchGraphSummary().then((g) => {
			this.$graph.set(g);
			this.$graphStatus.set(g ? 'ok' : 'unavailable');
		});

		const allPromises: Promise<void>[] = [
			edgePromise,
			securityPromise,
			kanbanPromise,
			reportPromise,
			graphPromise,
		];

		if (token && isStaff) {
			allPromises.push(
				fetchGrafanaSummary(token).then((g) => {
					this.$grafana.set(g);
					this.$grafanaStatus.set(g ? 'ok' : 'unavailable');
				}),
				fetchArgoSummary(token).then((a) => {
					this.$argo.set(a);
					this.$argoStatus.set(a ? 'ok' : 'unavailable');
				}),
				fetchClickHouseSummary(token).then((ch) => {
					this.$clickhouse.set(ch);
					this.$clickhouseStatus.set(ch ? 'ok' : 'unavailable');
				}),
				fetchRowsSummary(token).then((r) => {
					this.$rows.set(r);
					if (r) {
						const allOk = Object.values(r.checks).every(
							(c) => c.ok,
						);
						this.$rowsStatus.set(allOk ? 'ok' : 'unavailable');
					} else {
						this.$rowsStatus.set('unavailable');
					}
				}),
			);
		}

		await Promise.all(allPromises);
		this.$lastUpdated.set(new Date());
		this.$loading.set(false);

		// Notify on service failures — collect unavailable staff services
		if (isStaff) {
			const failures: string[] = [];
			if (this.$grafanaStatus.get() === 'unavailable')
				failures.push('Grafana');
			if (this.$argoStatus.get() === 'unavailable')
				failures.push('ArgoCD');
			if (this.$clickhouseStatus.get() === 'unavailable')
				failures.push('ClickHouse');
			if (this.$rowsStatus.get() === 'unavailable') failures.push('ROWS');
			if (failures.length > 0) {
				addToast({
					id: `svc-err-${Date.now()}`,
					message: `${failures.join(', ')} unavailable`,
					severity: 'warning',
					duration: 5000,
				});
			}
		}

		if (this.$edgeStatus.get() === 'unavailable') {
			addToast({
				id: `edge-err-${Date.now()}`,
				message: 'Edge service unavailable',
				severity: 'warning',
				duration: 5000,
			});
		}
	}
}

export const homeService = new HomeService();
