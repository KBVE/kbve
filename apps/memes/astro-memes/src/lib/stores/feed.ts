/**
 * Feed Store — framework-agnostic state management for the meme feed.
 *
 * Uses nanostores so any island (React, Svelte, vanilla) can subscribe.
 * All data fetching goes through axum's API (/api/v1/...).
 * User JWT is read from the $auth nanostore when needed.
 */

import { atom, map } from 'nanostores';
import { $auth } from '@kbve/astro';
import type { FeedMeme } from '../memeService';
import { authBridge } from '../supa';

// ── Configuration ────────────────────────────────────────────────────

const API_BASE = ''; // same origin — axum serves both static + API
const FEED_LIMIT = 8;

// ── Stores ───────────────────────────────────────────────────────────

/** Memes currently in the feed. */
export const $feedMemes = atom<FeedMeme[]>([]);

/** Pagination cursor for next page. */
export const $feedCursor = atom<string | null>(null);

/** Whether more memes are available. */
export const $feedHasMore = atom(true);

/** Loading state: 'idle' | 'initial' | 'more' */
export const $feedLoading = atom<'idle' | 'initial' | 'more'>('idle');

/** Per-meme user reaction (meme_id → reaction 1-6). */
export const $userReactions = map<Record<string, number>>({});

/** Set of meme IDs the user has saved. */
export const $userSaves = atom<Set<string>>(new Set());

/** Set of meme IDs already tracked as viewed. */
const viewedIds = new Set<string>();

// ── Helpers ──────────────────────────────────────────────────────────

async function getAuthHeaders(): Promise<Record<string, string>> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
	};
	try {
		const session = await authBridge.getSession();
		if (session?.access_token) {
			headers['Authorization'] = `Bearer ${session.access_token}`;
		}
	} catch {
		// anonymous
	}
	return headers;
}

async function apiPost<T = unknown>(
	path: string,
	body: Record<string, unknown>,
): Promise<T> {
	const headers = await getAuthHeaders();
	const res = await fetch(`${API_BASE}${path}`, {
		method: 'POST',
		headers,
		body: JSON.stringify(body),
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data?.error || `API error (${res.status})`);
	return data as T;
}

async function apiGet<T = unknown>(
	path: string,
	params?: Record<string, string>,
): Promise<T> {
	const url = new URL(path, window.location.origin);
	if (params) {
		for (const [k, v] of Object.entries(params)) {
			if (v) url.searchParams.set(k, v);
		}
	}
	const res = await fetch(url.toString());
	const data = await res.json();
	if (!res.ok) throw new Error(data?.error || `API error (${res.status})`);
	return data as T;
}

// ── Feed Actions ─────────────────────────────────────────────────────

interface FeedResponse {
	memes: FeedMeme[];
	next_cursor: string | null;
}

/** Load the initial feed page. */
export async function loadFeed(tag?: string | null): Promise<void> {
	if ($feedLoading.get() !== 'idle') return;
	$feedLoading.set('initial');

	try {
		const params: Record<string, string> = {
			limit: String(FEED_LIMIT),
		};
		if (tag) params.tag = tag;

		const data = await apiGet<FeedResponse>('/api/v1/feed', params);
		$feedMemes.set(data.memes);
		$feedCursor.set(data.next_cursor);
		$feedHasMore.set(data.memes.length >= FEED_LIMIT);
	} catch {
		// On error, keep empty — placeholder data handled by component
		$feedHasMore.set(false);
	} finally {
		$feedLoading.set('idle');
	}
}

/** Load the next page of memes. */
export async function loadMore(): Promise<void> {
	const cursor = $feedCursor.get();
	if ($feedLoading.get() !== 'idle' || !$feedHasMore.get()) return;
	$feedLoading.set('more');

	try {
		const params: Record<string, string> = {
			limit: String(FEED_LIMIT),
		};
		if (cursor) params.cursor = cursor;

		const data = await apiGet<FeedResponse>('/api/v1/feed', params);
		$feedMemes.set([...$feedMemes.get(), ...data.memes]);
		$feedCursor.set(data.next_cursor);
		$feedHasMore.set(data.memes.length >= FEED_LIMIT);
	} catch {
		// silently fail — user can scroll again
	} finally {
		$feedLoading.set('idle');
	}
}

// ── View / Share Tracking ────────────────────────────────────────────

/** Track a meme view (fire once per session per meme). */
export function trackView(memeId: string): void {
	if (viewedIds.has(memeId)) return;
	viewedIds.add(memeId);
	apiPost('/api/v1/view', { meme_id: memeId }).catch(() => {});
}

/** Track a meme share. */
export function trackShare(memeId: string): void {
	// Optimistic increment
	$feedMemes.set(
		$feedMemes
			.get()
			.map((m) =>
				m.id === memeId ? { ...m, share_count: m.share_count + 1 } : m,
			),
	);
	apiPost('/api/v1/share', { meme_id: memeId }).catch(() => {
		// rollback
		$feedMemes.set(
			$feedMemes
				.get()
				.map((m) =>
					m.id === memeId
						? { ...m, share_count: m.share_count - 1 }
						: m,
				),
		);
	});
}

// ── Reactions (Optimistic) ───────────────────────────────────────────

/** React to a meme or toggle off if same reaction. */
export function reactToMeme(memeId: string, reaction: number): void {
	if ($auth.get().tone !== 'auth') return;

	const prev = $userReactions.get()[memeId] ?? null;
	const toggling = prev === reaction;

	// Optimistic state
	const nextReactions = { ...$userReactions.get() };
	if (toggling) {
		delete nextReactions[memeId];
	} else {
		nextReactions[memeId] = reaction;
	}
	$userReactions.set(nextReactions);

	// Optimistic count
	$feedMemes.set(
		$feedMemes.get().map((m) => {
			if (m.id !== memeId) return m;
			let delta = 0;
			if (toggling) delta = -1;
			else if (prev === null) delta = 1;
			return { ...m, reaction_count: m.reaction_count + delta };
		}),
	);

	const promise = toggling
		? apiPost('/api/v1/unreact', { meme_id: memeId })
		: apiPost('/api/v1/react', { meme_id: memeId, reaction });

	promise.catch(() => {
		// Rollback
		const rollback = { ...$userReactions.get() };
		if (prev === null) {
			delete rollback[memeId];
		} else {
			rollback[memeId] = prev;
		}
		$userReactions.set(rollback);

		$feedMemes.set(
			$feedMemes.get().map((m) => {
				if (m.id !== memeId) return m;
				let delta = 0;
				if (toggling) delta = 1;
				else if (prev === null) delta = -1;
				return { ...m, reaction_count: m.reaction_count + delta };
			}),
		);
	});
}

// ── Saves (Optimistic) ──────────────────────────────────────────────

export function saveMeme(memeId: string): void {
	if ($auth.get().tone !== 'auth') return;

	const next = new Set($userSaves.get());
	next.add(memeId);
	$userSaves.set(next);

	$feedMemes.set(
		$feedMemes
			.get()
			.map((m) =>
				m.id === memeId ? { ...m, save_count: m.save_count + 1 } : m,
			),
	);

	apiPost('/api/v1/save', { meme_id: memeId }).catch(() => {
		const rollback = new Set($userSaves.get());
		rollback.delete(memeId);
		$userSaves.set(rollback);
		$feedMemes.set(
			$feedMemes
				.get()
				.map((m) =>
					m.id === memeId
						? { ...m, save_count: m.save_count - 1 }
						: m,
				),
		);
	});
}

export function unsaveMeme(memeId: string): void {
	if ($auth.get().tone !== 'auth') return;

	const next = new Set($userSaves.get());
	next.delete(memeId);
	$userSaves.set(next);

	$feedMemes.set(
		$feedMemes
			.get()
			.map((m) =>
				m.id === memeId ? { ...m, save_count: m.save_count - 1 } : m,
			),
	);

	apiPost('/api/v1/unsave', { meme_id: memeId }).catch(() => {
		const rollback = new Set($userSaves.get());
		rollback.add(memeId);
		$userSaves.set(rollback);
		$feedMemes.set(
			$feedMemes
				.get()
				.map((m) =>
					m.id === memeId
						? { ...m, save_count: m.save_count + 1 }
						: m,
				),
		);
	});
}
