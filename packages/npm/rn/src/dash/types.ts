import type { ReactNode } from 'react';
import type { BadgeTone } from './_ui';

/**
 * The generic dashboard contract: `<T> of <t> of <n>`.
 *   N = Stream  — a {@link StreamSource} owning fetch/poll/cache, yields N items.
 *   T = Item    — the entity type a source normalizes raw payloads into.
 *   t = Lens    — a {@link StreamLens} projecting one T into render models.
 * Any data stream (ArgoCD, Forgejo, Grafana, …) plugs in as a source + a lens.
 */

export interface FetchContext {
	/** Aborts when the source is disposed or a newer fetch supersedes this one. */
	signal: AbortSignal;
}

export interface StreamSourceConfig<TRaw, TItem> {
	/** Cache key prefix; the source namespaces its own keys under it. */
	key: string;
	/** Fetch the raw payload list. Owns auth, URL, and transport (domain concern). */
	fetch: (ctx: FetchContext) => Promise<TRaw[]>;
	/** Project one raw record into the stable item shape the views render. */
	normalize: (raw: TRaw) => TItem;
	/** Stable identity for an item (dedupe, expand target, list key). */
	id: (item: TItem) => string;
	/**
	 * Render-relevant fingerprint. When unchanged across a poll the previous
	 * item reference is reused, so memoized rows skip re-render. Defaults to
	 * `JSON.stringify(item)`.
	 */
	signature?: (item: TItem) => string;
	/** Auto-refresh interval in ms. Omit/0 to disable polling. */
	pollMs?: number;
	/** Cache TTL in ms. Omit to skip persistence. */
	cacheTtlMs?: number;
	/**
	 * Optional side-channel summary fetched alongside items each poll (cluster
	 * health, aggregate counts, per-namespace rollups…). Cached + hydrated like
	 * items, so the last-known value paints instantly — no layout shift — then
	 * refreshes. Surfaced to the lens's `stats` as the second argument. Should
	 * resolve (not throw) on failure so it never blocks the item fetch.
	 */
	fetchMeta?: (ctx: FetchContext) => Promise<unknown>;
}

export interface StreamState<TItem> {
	items: TItem[];
	/** Cached side-channel summary from `fetchMeta` (null until first paint). */
	meta: unknown;
	loading: boolean;
	error: string | null;
	lastUpdated: number | null;
	fromCache: boolean;
	expandedId: string | null;
	search: string;
	filterId: string | null;
	groupKey: string | null;
	/** Key of the in-flight action (`<itemId>:<actionId>`), or null. */
	actionBusy: string | null;
	actionError: string | null;
	actionMsg: string | null;
}

export interface StreamStore<TItem> {
	/** Subscribe for change notifications (drives React via useSyncExternalStore). */
	subscribe: (listener: () => void) => () => void;
	/** Current immutable snapshot. */
	get: () => StreamState<TItem>;
	/** Cache key prefix this store was created with. */
	key: string;
	/** Stable identity for an item — the view keys rows off this. */
	id: (item: TItem) => string;
	/** Force a fetch now (bypasses poll cadence; keeps cache write). */
	refresh: () => Promise<void>;
	/** Begin polling + hydrate from cache. Idempotent. */
	start: () => void;
	/** Stop polling and abort in-flight work. */
	stop: () => void;
	toggleExpanded: (id: string) => void;
	setSearch: (q: string) => void;
	setFilter: (id: string | null) => void;
	setGroupKey: (key: string | null) => void;
	/**
	 * Run a mutation with single-flight + busy/error tracking. `key` scopes the
	 * busy indicator (`<itemId>:<actionId>`); refreshes the stream on success
	 * unless `opts.refresh === false`.
	 */
	runAction: (
		key: string,
		fn: () => Promise<void>,
		opts?: { refresh?: boolean; successMsg?: string },
	) => Promise<void>;
}

export interface StatModel {
	id: string;
	label: string;
	value: string | number;
	tone?: BadgeTone;
	/** Optional click target (e.g. apply the matching filter). */
	onPress?: () => void;
}

export interface StreamAction<TItem> {
	id: string;
	label: string;
	/** Requires a two-tap inline confirm before running. */
	destructive?: boolean;
	/** The raw mutation; the store wraps it with busy/error/refresh handling. */
	run: (item: TItem) => Promise<void>;
}

export interface StreamFilter<TItem> {
	id: string;
	label: string;
	tone?: BadgeTone;
	predicate: (item: TItem) => boolean;
}

/**
 * The Lens (t): everything needed to render a stream of T without the view
 * knowing anything domain-specific.
 */
export interface StreamLens<TItem> {
	/** Dense single-line row (table layout). */
	row: (item: TItem, expanded: boolean) => ReactNode;
	/** Rich card (grid layout). Falls back to `row` when omitted. */
	card?: (item: TItem, expanded: boolean) => ReactNode;
	/** Inline detail rendered under an expanded item. */
	detail?: (item: TItem) => ReactNode;
	/**
	 * Summary stat cards derived from the item set and the optional cached
	 * `meta` side-channel (see {@link StreamSourceConfig.fetchMeta}).
	 */
	stats?: (items: TItem[], meta?: unknown) => StatModel[];
	/** Free-text search haystack for an item. */
	searchText?: (item: TItem) => string;
	/** Grouping bucket label for an item (used when groupKey is active). */
	group?: (item: TItem) => string;
	/** Chip filters shown above the list. */
	filters?: readonly StreamFilter<TItem>[];
	/** Mutations offered on an expanded item (sync, refresh, rollback…). */
	actions?: readonly StreamAction<TItem>[];
}
