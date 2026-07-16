import { createSignal } from '@kbve/core';
import { kvStore } from '../store/kv';
import type { CacheEntry } from '../store/types';
import * as SV from './savedViews';
import type {
	SavedView,
	StreamParams,
	StreamSourceConfig,
	StreamState,
	StreamStore,
} from './types';

const EMPTY = <TItem>(initialParams: StreamParams): StreamState<TItem> => ({
	items: [],
	meta: null,
	loading: true,
	error: null,
	lastUpdated: null,
	fromCache: false,
	expandedId: null,
	search: '',
	filterId: null,
	groupKey: null,
	actionBusy: null,
	actionError: null,
	actionMsg: null,
	params: initialParams,
	views: [],
	activeViewId: null,
});

function serializeParams(params: StreamParams): string {
	const keys = Object.keys(params)
		.filter((k) => params[k] !== undefined)
		.sort();
	return keys.map((k) => `${k}=${params[k]}`).join('&');
}

/**
 * Build a polling/caching data source for one stream of items. Domain code
 * supplies fetch + normalize + identity; the source owns the lifecycle:
 * cache hydrate, poll, abort/supersede, and signature-based reference reuse so
 * memoized rows skip re-render when nothing visible changed.
 */
export function createStreamSource<TRaw, TItem>(
	config: StreamSourceConfig<TRaw, TItem>,
): StreamStore<TItem> {
	const {
		key,
		fetch,
		fetchMeta,
		normalize,
		id,
		signature = (item: TItem) => JSON.stringify(item),
		pollMs,
		cacheTtlMs,
		initialParams = {},
		defaultViews = [],
	} = config;

	const signal = createSignal<StreamState<TItem>>(EMPTY<TItem>(initialParams));

	const viewsKey = `dash:${key}:views`;
	const persistViews = (views: SavedView[]) => {
		try {
			void kvStore.set(viewsKey, { value: views, storedAt: Date.now() });
		} catch {
			/* persistence unavailable (e.g. no Worker in this env) — in-memory state still updated */
		}
	};

	// Reference-reuse caches: previous item by id + its fingerprint, so an
	// unchanged item keeps its object identity across polls.
	let prevById = new Map<string, TItem>();
	const sigCache = new WeakMap<object, string>();

	const sigOf = (item: TItem): string => {
		const obj = item as unknown as object;
		let sig = sigCache.get(obj);
		if (sig === undefined) {
			sig = signature(item);
			sigCache.set(obj, sig);
		}
		return sig;
	};

	const reconcile = (next: TItem[]): TItem[] => {
		const out = next.map((item) => {
			const old = prevById.get(id(item));
			return old && sigOf(old) === sigOf(item) ? old : item;
		});
		const map = new Map<string, TItem>();
		for (const item of out) map.set(id(item), item);
		prevById = map;
		return out;
	};

	const patch = (next: Partial<StreamState<TItem>>) =>
		signal.set((prev) => ({ ...prev, ...next }));

	let controller: AbortController | null = null;
	let timer: ReturnType<typeof setInterval> | undefined;
	let started = false;

	const runFetch = async (): Promise<void> => {
		controller?.abort();
		const ctrl = new AbortController();
		controller = ctrl;
		const params = signal.get().params;
		const scopedKey = `dash:${key}:${serializeParams(params)}`;
		try {
			const [raw, meta] = await Promise.all([
				fetch({ signal: ctrl.signal }, params),
				fetchMeta
					? fetchMeta({ signal: ctrl.signal }, params).catch(
							() => undefined,
						)
					: Promise.resolve(undefined),
			]);
			if (ctrl.signal.aborted) return;
			const items = reconcile(raw.map(normalize));
			patch({
				items,
				...(fetchMeta ? { meta: meta ?? null } : {}),
				loading: false,
				error: null,
				fromCache: false,
				lastUpdated: Date.now(),
			});
			if (cacheTtlMs) {
				void kvStore.set(scopedKey, {
					value: items,
					storedAt: Date.now(),
				});
				if (fetchMeta) {
					void kvStore.set(`${scopedKey}:meta`, {
						value: meta ?? null,
						storedAt: Date.now(),
					});
				}
			}
		} catch (e: unknown) {
			if (ctrl.signal.aborted) return;
			patch({
				loading: false,
				error: e instanceof Error ? e.message : 'Request failed',
			});
		}
	};

	const hydrate = async (): Promise<void> => {
		if (!cacheTtlMs) return;
		const params = signal.get().params;
		const scopedKey = `dash:${key}:${serializeParams(params)}`;
		try {
			const [cached, cachedMeta] = await Promise.all([
				kvStore.get<CacheEntry<TItem[]>>(scopedKey),
				fetchMeta
					? kvStore.get<CacheEntry<unknown>>(`${scopedKey}:meta`)
					: Promise.resolve(null),
			]);
			// Paint cached meta first so summary tiles render immediately —
			// this is what removes the stat-grid layout shift on load.
			if (cachedMeta) patch({ meta: cachedMeta.value });
			if (cached && signal.get().items.length === 0) {
				prevById = new Map(cached.value.map((i) => [id(i), i]));
				patch({
					items: cached.value,
					loading: false,
					fromCache: true,
					lastUpdated: cached.storedAt,
				});
			}
		} catch {
			/* cache miss / unavailable — fall through to network */
		}
	};

	return {
		subscribe: signal.subscribe,
		get: signal.get,
		key,
		id,
		refresh: runFetch,
		start: () => {
			if (started) return;
			started = true;
			void (async () => {
				let stored: SavedView[] = [];
				try {
					const entry = await kvStore.get<{ value: SavedView[] }>(
						viewsKey,
					);
					stored = entry?.value ?? [];
				} catch {
					/* ignore */
				}
				patch({ views: SV.seedViews(defaultViews, stored) });
			})();
			void hydrate().then(runFetch);
			if (pollMs && pollMs > 0) {
				timer = setInterval(() => void runFetch(), pollMs);
			}
		},
		stop: () => {
			started = false;
			controller?.abort();
			if (timer) clearInterval(timer);
			timer = undefined;
		},
		toggleExpanded: (target) =>
			patch({
				expandedId: signal.get().expandedId === target ? null : target,
			}),
		setSearch: (q) => patch({ search: q }),
		setFilter: (filterId) => patch({ filterId }),
		setGroupKey: (groupKey) => patch({ groupKey }),
		runAction: async (key, fn, opts) => {
			if (signal.get().actionBusy) return;
			patch({ actionBusy: key, actionError: null, actionMsg: null });
			try {
				await fn();
				patch({ actionMsg: opts?.successMsg ?? 'Done' });
				if (opts?.refresh !== false) await runFetch();
			} catch (e: unknown) {
				patch({
					actionError:
						e instanceof Error ? e.message : 'Action failed',
				});
			} finally {
				patch({ actionBusy: null });
			}
		},
		setParams: (patchParams) => {
			patch({ params: { ...signal.get().params, ...patchParams } });
			void runFetch();
		},
		resetParams: () => {
			patch({ params: { ...initialParams } });
			void runFetch();
		},
		saveView: (name) => {
			const view: SavedView = {
				id: SV.makeViewId(name, signal.get().views.length),
				name,
				params: { ...signal.get().params },
			};
			const views = SV.addView(signal.get().views, view);
			patch({ views });
			persistViews(views);
		},
		applyView: (id) => {
			const view = signal.get().views.find((v) => v.id === id);
			if (!view) return;
			patch({ params: { ...view.params }, activeViewId: id });
			void runFetch();
		},
		removeView: (id) => {
			const views = SV.removeView(signal.get().views, id);
			patch({ views });
			persistViews(views);
		},
		renameView: (id, name) => {
			const views = SV.renameView(signal.get().views, id, name);
			patch({ views });
			persistViews(views);
		},
		reorderViews: (ids) => {
			const views = SV.reorderViews(signal.get().views, ids);
			patch({ views });
			persistViews(views);
		},
		exportViews: () => SV.exportViews(signal.get().views),
		importViews: (json) => {
			try {
				const incoming = SV.importViews(json);
				const merged = incoming.reduce(
					(acc, v) => SV.addView(acc, v),
					signal.get().views,
				);
				patch({ views: merged });
				persistViews(merged);
				return incoming.length;
			} catch {
				return 0;
			}
		},
	};
}
