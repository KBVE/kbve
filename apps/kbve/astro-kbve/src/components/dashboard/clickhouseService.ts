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
export type SortField = 'total' | 'errors' | 'warns' | 'namespace';

export interface StatRow {
	pod_namespace: string;
	service: string;
	level: string;
	cnt: string;
}

export interface LogRow {
	timestamp: string;
	pod_namespace: string;
	service: string;
	level: string;
	message: string;
	pod_name: string;
	metadata: string;
}

export interface StatsData {
	rows: StatRow[];
	count: number;
}

export interface QueryData {
	rows: LogRow[];
	count: number;
}

export interface NamespaceSummary {
	namespace: string;
	total: number;
	errors: number;
	warns: number;
	infos: number;
	debugs: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROXY_BASE = '/dashboard/clickhouse/proxy';
const CACHE_TTL_MS = 60 * 1000;
const SEARCH_DEBOUNCE_MS = 300;

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function getCache<T>(key: string): T | null {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const cached: { data: T; cached_at: number } = JSON.parse(raw);
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
// Helpers
// ---------------------------------------------------------------------------

export function levelColor(level: string): string {
	switch (level) {
		case 'error':
			return '#ef4444';
		case 'warn':
			return '#f59e0b';
		case 'info':
			return '#3b82f6';
		case 'debug':
			return '#6b7280';
		default:
			return '#94a3b8';
	}
}

export function formatTimestamp(ts: string): string {
	try {
		const d = new Date(ts.replace(' ', 'T') + 'Z');
		return d.toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});
	} catch {
		return ts;
	}
}

function buildNamespaceSummaries(stats: StatsData): NamespaceSummary[] {
	const map = new Map<string, NamespaceSummary>();
	for (const row of stats.rows) {
		const ns = row.pod_namespace;
		if (!map.has(ns)) {
			map.set(ns, {
				namespace: ns,
				total: 0,
				errors: 0,
				warns: 0,
				infos: 0,
				debugs: 0,
			});
		}
		const summary = map.get(ns)!;
		const cnt = parseInt(row.cnt, 10);
		summary.total += cnt;
		if (row.level === 'error') summary.errors += cnt;
		else if (row.level === 'warn') summary.warns += cnt;
		else if (row.level === 'info') summary.infos += cnt;
		else if (row.level === 'debug') summary.debugs += cnt;
	}
	return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function sortNamespaces(
	summaries: NamespaceSummary[],
	field: SortField,
): NamespaceSummary[] {
	const sorted = [...summaries];
	switch (field) {
		case 'errors':
			return sorted.sort((a, b) => b.errors - a.errors);
		case 'warns':
			return sorted.sort((a, b) => b.warns - a.warns);
		case 'namespace':
			return sorted.sort((a, b) =>
				a.namespace.localeCompare(b.namespace),
			);
		case 'total':
		default:
			return sorted.sort((a, b) => b.total - a.total);
	}
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class ClickHouseService {
	// Auth
	public readonly $authState = atom<AuthState>('loading');
	public readonly $accessToken = atom<string | null>(null);

	// Data
	public readonly $stats = atom<StatsData | null>(null);
	public readonly $logs = atom<QueryData | null>(null);

	// Loading
	public readonly $statsLoading = atom<boolean>(true);
	public readonly $logsLoading = atom<boolean>(false);

	// Time range
	public readonly $minutes = atom<number>(60);

	// Filters
	public readonly $levelFilter = atom<string>('');
	public readonly $namespaceFilter = atom<string>('');
	public readonly $serviceFilter = atom<string>('');
	public readonly $searchText = atom<string>('');
	public readonly $debouncedSearch = atom<string>('');

	// Sort
	public readonly $sortField = atom<SortField>('total');

	// Debounce timer (internal)
	private _debounceTimer: ReturnType<typeof setTimeout> | undefined;

	// --- Computed atoms ---

	public readonly $namespaceSummaries = computed([this.$stats], (stats) => {
		if (!stats) return [];
		return buildNamespaceSummaries(stats);
	});

	public readonly $sortedNamespaces = computed(
		[this.$namespaceSummaries, this.$sortField],
		(summaries, field) => sortNamespaces(summaries, field),
	);

	public readonly $totalLogs = computed([this.$namespaceSummaries], (ns) =>
		ns.reduce((s, n) => s + n.total, 0),
	);

	public readonly $totalErrors = computed([this.$namespaceSummaries], (ns) =>
		ns.reduce((s, n) => s + n.errors, 0),
	);

	public readonly $totalWarns = computed([this.$namespaceSummaries], (ns) =>
		ns.reduce((s, n) => s + n.warns, 0),
	);

	public readonly $allNamespaces = computed(
		[this.$namespaceSummaries],
		(ns) => ns.map((n) => n.namespace),
	);

	public readonly $allServices = computed([this.$stats], (stats) => {
		if (!stats) return [];
		return [...new Set(stats.rows.map((r) => r.service))].sort();
	});

	public readonly $hasActiveFilters = computed(
		[
			this.$levelFilter,
			this.$namespaceFilter,
			this.$serviceFilter,
			this.$searchText,
		],
		(level, ns, svc, search) => !!(level || ns || svc || search),
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

	public async loadStats(): Promise<void> {
		const token = this.$accessToken.get();
		if (!token) return;
		this.$statsLoading.set(true);
		try {
			const minutes = this.$minutes.get();
			const cacheKey = `cache:ch:stats:${minutes}`;
			const cached = getCache<StatsData>(cacheKey);
			if (cached) {
				this.$stats.set(cached);
				this.$statsLoading.set(false);
				return;
			}
			const resp = await fetch(PROXY_BASE, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ command: 'stats', minutes }),
				signal: AbortSignal.timeout(15000),
			});
			if (resp.status === 403) {
				this.$authState.set('forbidden');
				this.$statsLoading.set(false);
				return;
			}
			if (!resp.ok) {
				this.$statsLoading.set(false);
				return;
			}
			const data: StatsData = await resp.json();
			setCache(cacheKey, data);
			this.$stats.set(data);
		} catch {
			// network error - leave stats as-is
		}
		this.$statsLoading.set(false);
	}

	public async loadLogs(): Promise<void> {
		const token = this.$accessToken.get();
		if (!token) return;
		this.$logsLoading.set(true);
		try {
			const params: Record<string, unknown> = {
				minutes: this.$minutes.get(),
				limit: 100,
			};
			const level = this.$levelFilter.get();
			const ns = this.$namespaceFilter.get();
			const svc = this.$serviceFilter.get();
			const search = this.$debouncedSearch.get();
			if (level) params.level = level;
			if (ns) params.pod_namespace = ns;
			if (svc) params.service = svc;
			if (search) params.search = search;

			const resp = await fetch(PROXY_BASE, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ command: 'query', ...params }),
				signal: AbortSignal.timeout(15000),
			});
			if (resp.status === 403) {
				this.$authState.set('forbidden');
				this.$logsLoading.set(false);
				return;
			}
			if (!resp.ok) {
				this.$logsLoading.set(false);
				return;
			}
			const data: QueryData = await resp.json();
			this.$logs.set(data);
		} catch {
			// network error
		}
		this.$logsLoading.set(false);
	}

	public refreshAll(): void {
		this.loadStats();
		this.loadLogs();
	}

	// --- Filter actions ---

	public setLevelFilter(level: string): void {
		this.$levelFilter.set(level);
	}

	public setNamespaceFilter(ns: string): void {
		this.$namespaceFilter.set(ns);
	}

	public setServiceFilter(svc: string): void {
		this.$serviceFilter.set(svc);
	}

	public setSearchText(text: string): void {
		this.$searchText.set(text);
		if (this._debounceTimer) clearTimeout(this._debounceTimer);
		this._debounceTimer = setTimeout(() => {
			this.$debouncedSearch.set(text);
		}, SEARCH_DEBOUNCE_MS);
	}

	public applySearchImmediate(): void {
		if (this._debounceTimer) clearTimeout(this._debounceTimer);
		this.$debouncedSearch.set(this.$searchText.get());
	}

	public clearSearch(): void {
		if (this._debounceTimer) clearTimeout(this._debounceTimer);
		this.$searchText.set('');
		this.$debouncedSearch.set('');
	}

	public clearFilters(): void {
		this.$levelFilter.set('');
		this.$namespaceFilter.set('');
		this.$serviceFilter.set('');
		this.clearSearch();
	}

	public handleSeverityClick(ns: string, level: string): void {
		if (
			this.$namespaceFilter.get() === ns &&
			this.$levelFilter.get() === level
		) {
			this.$namespaceFilter.set('');
			this.$levelFilter.set('');
		} else {
			this.$namespaceFilter.set(ns);
			this.$levelFilter.set(level);
		}
	}

	public handleNamespaceClick(ns: string): void {
		if (this.$namespaceFilter.get() === ns && !this.$levelFilter.get()) {
			this.$namespaceFilter.set('');
		} else {
			this.$namespaceFilter.set(ns);
			this.$levelFilter.set('');
		}
	}

	public toggleLevelFilter(level: string): void {
		if (this.$levelFilter.get() === level) {
			this.$levelFilter.set('');
		} else {
			this.$levelFilter.set(level);
		}
	}

	public setMinutes(m: number): void {
		this.$minutes.set(m);
	}

	public setSortField(field: SortField): void {
		this.$sortField.set(field);
	}
}

export const clickhouseService = new ClickHouseService();
