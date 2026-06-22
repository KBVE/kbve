import { createSignal } from '@kbve/core';
import { kvStore } from '../store/kv';
import type { CacheEntry } from '../store/types';
import type { StreamSourceConfig, StreamState, StreamStore } from './types';

const EMPTY = <TItem>(): StreamState<TItem> => ({
	items: [],
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
});

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
		normalize,
		id,
		signature = (item: TItem) => JSON.stringify(item),
		pollMs,
		cacheTtlMs,
	} = config;

	const cacheKey = `dash:${key}`;
	const signal = createSignal<StreamState<TItem>>(EMPTY<TItem>());

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
		try {
			const raw = await fetch({ signal: ctrl.signal });
			if (ctrl.signal.aborted) return;
			const items = reconcile(raw.map(normalize));
			patch({
				items,
				loading: false,
				error: null,
				fromCache: false,
				lastUpdated: Date.now(),
			});
			if (cacheTtlMs) {
				void kvStore.set(cacheKey, {
					value: items,
					storedAt: Date.now(),
				});
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
		try {
			const cached = await kvStore.get<CacheEntry<TItem[]>>(cacheKey);
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
		id,
		refresh: runFetch,
		start: () => {
			if (started) return;
			started = true;
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
	};
}
