/**
 * Fine-grained nanostores for server grid state (#8).
 *
 * Replaces per-component useState with shared atoms so only the
 * subscribing component/slice re-renders on change.
 */

import { atom, computed } from 'nanostores';
import type { ServerCard, SortOption } from './types';
import { fetchServers } from './serverService';

// ── Atoms ───────────────────────────────────────────────────────────

export const $servers = atom<ServerCard[]>([]);
export const $total = atom(0);
export const $page = atom(1);
export const $category = atom<string | null>(null);
export const $sort = atom<SortOption>('votes');
export const $loading = atom(true);

// ── Derived ─────────────────────────────────────────────────────────

export const $hasMore = computed([$servers, $total], (s, t) => s.length < t);

// ── Actions ─────────────────────────────────────────────────────────

let loadId = 0;

export async function loadServers(reset = false) {
	const id = ++loadId;
	$loading.set(true);

	const p = reset ? 1 : $page.get();
	const result = await fetchServers({
		category: $category.get() ?? undefined,
		sort: $sort.get(),
		page: p,
		limit: 24,
	});

	// Stale guard — ignore if a newer load was triggered
	if (id !== loadId) return;

	if (reset) {
		$servers.set(result.servers);
		$page.set(1);
	} else {
		$servers.set([...$servers.get(), ...result.servers]);
	}
	$total.set(result.total);
	$loading.set(false);
}

export function setCategory(cat: string | null) {
	$category.set(cat);
	$servers.set([]);
	loadServers(true);
}

export function setSort(sort: SortOption) {
	$sort.set(sort);
	$servers.set([]);
	loadServers(true);
}

export function loadMore() {
	$page.set($page.get() + 1);
	loadServers(false);
}

export function applyVote(serverId: string) {
	$servers.set(
		$servers
			.get()
			.map((s) =>
				s.server_id === serverId
					? { ...s, vote_count: s.vote_count + 1 }
					: s,
			),
	);
}
