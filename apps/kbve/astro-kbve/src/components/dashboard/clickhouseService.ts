import { atom, computed } from 'nanostores';
import { initSupa, getSupa } from '@/lib/supa';

// ---------------------------------------------------------------------------
// Types — sourced from proto-generated ClickHouse schema
// ---------------------------------------------------------------------------

import type {
	LogRow,
	StatRow,
	StatsData,
	QueryData,
	QueryParams,
} from '@/data/schema';

export type { LogRow, StatRow, StatsData, QueryData, QueryParams };

export type AuthState =
	| 'loading'
	| 'authenticated'
	| 'unauthenticated'
	| 'forbidden';
export type SortField = 'total' | 'errors' | 'warns' | 'namespace';

export interface NamespaceSummary {
	namespace: string;
	total: number;
	errors: number;
	warns: number;
	infos: number;
	debugs: number;
}

export interface QueryTab {
	id: string;
	label: string;
	params: QueryParams;
	result: QueryData | null;
	loading: boolean;
	cachedAt: number | null;
	pollIntervalSec: number | null;
	isPreset: boolean;
}

export interface QueryPreset {
	id: string;
	label: string;
	params: QueryParams;
	pollIntervalSec: number | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROXY_BASE = '/dashboard/clickhouse/proxy';
const CACHE_TTL_MS = 60 * 1000;
const SEARCH_DEBOUNCE_MS = 300;
const QUERY_CACHE_KEY = 'ch:query-tabs';
const PRESETS_CACHE_KEY = 'ch:presets';

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

function getStoredJSON<T>(key: string): T | null {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

function setStoredJSON<T>(key: string, data: T): void {
	try {
		localStorage.setItem(key, JSON.stringify(data));
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

function queryParamsKey(params: QueryParams): string {
	return JSON.stringify(params, Object.keys(params).sort());
}

let _nextTabId = 1;
function genTabId(): string {
	return `qt-${Date.now()}-${_nextTabId++}`;
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

	// Query tabs
	public readonly $queryTabs = atom<QueryTab[]>([]);
	public readonly $activeTabId = atom<string | null>(null);
	public readonly $presets = atom<QueryPreset[]>([]);

	// Debounce timer (internal)
	private _debounceTimer: ReturnType<typeof setTimeout> | undefined;
	// Poll timers keyed by tab id
	private _pollTimers = new Map<string, ReturnType<typeof setInterval>>();

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

	public readonly $activeTab = computed(
		[this.$queryTabs, this.$activeTabId],
		(tabs, id) => tabs.find((t) => t.id === id) ?? null,
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
			this._restoreTabsFromStorage();
			this._restorePresetsFromStorage();
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
			// network error
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

	// -----------------------------------------------------------------------
	// Query Tab System
	// -----------------------------------------------------------------------

	private _restoreTabsFromStorage(): void {
		const stored = getStoredJSON<
			Array<{
				id: string;
				label: string;
				params: QueryParams;
				pollIntervalSec: number | null;
				isPreset: boolean;
			}>
		>(QUERY_CACHE_KEY);
		if (!stored || !Array.isArray(stored)) return;
		const tabs: QueryTab[] = stored.map((t) => ({
			...t,
			result: null,
			loading: false,
			cachedAt: null,
		}));
		this.$queryTabs.set(tabs);
		if (tabs.length > 0) {
			this.$activeTabId.set(tabs[0].id);
		}
	}

	private _restorePresetsFromStorage(): void {
		const stored = getStoredJSON<QueryPreset[]>(PRESETS_CACHE_KEY);
		if (stored && Array.isArray(stored)) {
			this.$presets.set(stored);
		}
	}

	private _persistTabs(): void {
		const tabs = this.$queryTabs.get().map((t) => ({
			id: t.id,
			label: t.label,
			params: t.params,
			pollIntervalSec: t.pollIntervalSec,
			isPreset: t.isPreset,
		}));
		setStoredJSON(QUERY_CACHE_KEY, tabs);
	}

	private _persistPresets(): void {
		setStoredJSON(PRESETS_CACHE_KEY, this.$presets.get());
	}

	private _updateTab(id: string, patch: Partial<QueryTab>): void {
		const tabs = this.$queryTabs.get();
		this.$queryTabs.set(
			tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)),
		);
	}

	public findExistingTab(params: QueryParams): QueryTab | null {
		const key = queryParamsKey(params);
		return (
			this.$queryTabs
				.get()
				.find((t) => queryParamsKey(t.params) === key) ?? null
		);
	}

	public createQueryTab(
		params: QueryParams,
		label?: string,
		pollIntervalSec?: number | null,
	): string {
		const existing = this.findExistingTab(params);
		if (existing) {
			this.$activeTabId.set(existing.id);
			return existing.id;
		}

		const id = genTabId();
		const tab: QueryTab = {
			id,
			label: label ?? this._buildLabel(params),
			params,
			result: null,
			loading: false,
			cachedAt: null,
			pollIntervalSec: pollIntervalSec ?? null,
			isPreset: false,
		};
		this.$queryTabs.set([...this.$queryTabs.get(), tab]);
		this.$activeTabId.set(id);
		this._persistTabs();
		this.executeTab(id);
		if (tab.pollIntervalSec && tab.pollIntervalSec > 0) {
			this._startPoll(id, tab.pollIntervalSec);
		}
		return id;
	}

	public createTabFromCurrentFilters(): string {
		const params: QueryParams = {
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
		return this.createQueryTab(params);
	}

	public removeQueryTab(id: string): void {
		this._stopPoll(id);
		const tabs = this.$queryTabs.get().filter((t) => t.id !== id);
		this.$queryTabs.set(tabs);
		if (this.$activeTabId.get() === id) {
			this.$activeTabId.set(tabs.length > 0 ? tabs[0].id : null);
		}
		this._persistTabs();
	}

	public setActiveTab(id: string): void {
		this.$activeTabId.set(id);
	}

	public reorderTabs(orderedIds: string[]): void {
		const tabMap = new Map(this.$queryTabs.get().map((t) => [t.id, t]));
		const reordered = orderedIds
			.map((id) => tabMap.get(id))
			.filter(Boolean) as QueryTab[];
		this.$queryTabs.set(reordered);
		this._persistTabs();
	}

	public renameTab(id: string, label: string): void {
		this._updateTab(id, { label });
		this._persistTabs();
	}

	public async executeTab(id: string): Promise<void> {
		const tab = this.$queryTabs.get().find((t) => t.id === id);
		if (!tab) return;
		const token = this.$accessToken.get();
		if (!token) return;

		this._updateTab(id, { loading: true });
		try {
			const resp = await fetch(PROXY_BASE, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ command: 'query', ...tab.params }),
				signal: AbortSignal.timeout(15000),
			});
			if (resp.status === 403) {
				this.$authState.set('forbidden');
				this._updateTab(id, { loading: false });
				return;
			}
			if (!resp.ok) {
				this._updateTab(id, { loading: false });
				return;
			}
			const data: QueryData = await resp.json();
			this._updateTab(id, {
				result: data,
				loading: false,
				cachedAt: Date.now(),
			});
		} catch {
			this._updateTab(id, { loading: false });
		}
	}

	// --- Polling ---

	public setTabPolling(id: string, intervalSec: number | null): void {
		this._stopPoll(id);
		this._updateTab(id, { pollIntervalSec: intervalSec });
		this._persistTabs();
		if (intervalSec && intervalSec > 0) {
			this._startPoll(id, intervalSec);
		}
	}

	private _startPoll(id: string, intervalSec: number): void {
		this._stopPoll(id);
		const timer = setInterval(() => {
			this.executeTab(id);
		}, intervalSec * 1000);
		this._pollTimers.set(id, timer);
	}

	private _stopPoll(id: string): void {
		const timer = this._pollTimers.get(id);
		if (timer) {
			clearInterval(timer);
			this._pollTimers.delete(id);
		}
	}

	public isTabPolling(id: string): boolean {
		return this._pollTimers.has(id);
	}

	// --- Presets ---

	public savePreset(
		label: string,
		params: QueryParams,
		pollIntervalSec: number | null,
	): string {
		const id = `preset-${Date.now()}`;
		const preset: QueryPreset = { id, label, params, pollIntervalSec };
		this.$presets.set([...this.$presets.get(), preset]);
		this._persistPresets();
		return id;
	}

	public saveTabAsPreset(tabId: string): string | null {
		const tab = this.$queryTabs.get().find((t) => t.id === tabId);
		if (!tab) return null;
		return this.savePreset(tab.label, tab.params, tab.pollIntervalSec);
	}

	public removePreset(id: string): void {
		this.$presets.set(this.$presets.get().filter((p) => p.id !== id));
		this._persistPresets();
	}

	public loadPreset(presetId: string): string | null {
		const preset = this.$presets.get().find((p) => p.id === presetId);
		if (!preset) return null;
		const tabId = this.createQueryTab(
			preset.params,
			preset.label,
			preset.pollIntervalSec,
		);
		this._updateTab(tabId, { isPreset: true });
		this._persistTabs();
		return tabId;
	}

	public exportPresets(): string {
		return JSON.stringify(this.$presets.get(), null, 2);
	}

	public importPresets(json: string): number {
		try {
			const imported = JSON.parse(json) as QueryPreset[];
			if (!Array.isArray(imported)) return 0;
			const existing = this.$presets.get();
			const existingKeys = new Set(
				existing.map((p) => queryParamsKey(p.params)),
			);
			const newPresets = imported.filter(
				(p) =>
					p.label &&
					p.params &&
					!existingKeys.has(queryParamsKey(p.params)),
			);
			if (newPresets.length === 0) return 0;
			// Re-ID imported presets to avoid collisions
			const reIdPresets = newPresets.map((p) => ({
				...p,
				id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			}));
			this.$presets.set([...existing, ...reIdPresets]);
			this._persistPresets();
			return reIdPresets.length;
		} catch {
			return 0;
		}
	}

	// --- Helpers ---

	private _buildLabel(params: QueryParams): string {
		const parts: string[] = [];
		if (params.pod_namespace) parts.push(params.pod_namespace);
		if (params.level) parts.push(params.level);
		if (params.service) parts.push(params.service);
		if (params.search) parts.push(`"${params.search}"`);
		if (parts.length === 0) parts.push('all logs');
		if (params.minutes) {
			const m = params.minutes;
			if (m >= 1440) parts.push(`${m / 1440}d`);
			else if (m >= 60) parts.push(`${m / 60}h`);
			else parts.push(`${m}m`);
		}
		return parts.join(' · ');
	}
}

export const clickhouseService = new ClickHouseService();
