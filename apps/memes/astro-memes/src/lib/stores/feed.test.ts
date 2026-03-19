import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Provide window.location for apiGet URL construction
if (typeof globalThis.window === 'undefined') {
	(globalThis as Record<string, unknown>).window = {
		location: { origin: 'http://localhost:4321' },
	};
}

// Mock @kbve/astro before importing feed store
vi.mock('@kbve/astro', () => ({
	$auth: {
		get: () => ({ tone: 'auth', name: 'test', id: 'user-1' }),
	},
}));

// Mock supa.ts authBridge
vi.mock('../supa', () => ({
	authBridge: {
		getSession: vi.fn().mockResolvedValue({ access_token: 'test-jwt' }),
	},
}));

import {
	$feedMemes,
	$feedCursor,
	$feedHasMore,
	$feedLoading,
	$userReactions,
	$userSaves,
	loadFeed,
	loadMore,
	reactToMeme,
	saveMeme,
	unsaveMeme,
	trackView,
	trackShare,
} from './feed';
import type { FeedMeme } from '../memeService';

// ── Test helpers ─────────────────────────────────────────────────────

function makeMeme(id: string, overrides?: Partial<FeedMeme>): FeedMeme {
	return {
		id,
		title: `Meme ${id}`,
		format: 1,
		asset_url: `https://cdn.test/${id}.jpg`,
		thumbnail_url: null,
		width: 800,
		height: 600,
		tags: [],
		view_count: 0,
		reaction_count: 0,
		comment_count: 0,
		save_count: 0,
		share_count: 0,
		created_at: '2026-01-01T00:00:00Z',
		author_name: null,
		author_avatar: null,
		...overrides,
	};
}

function mockFetch(response: unknown, ok = true) {
	return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
		ok,
		status: ok ? 200 : 500,
		json: () => Promise.resolve(response),
	} as Response);
}

// ── Reset stores between tests ───────────────────────────────────────

beforeEach(() => {
	$feedMemes.set([]);
	$feedCursor.set(null);
	$feedHasMore.set(true);
	$feedLoading.set('idle');
	$userReactions.set({});
	$userSaves.set(new Set());
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ── loadFeed ─────────────────────────────────────────────────────────

describe('loadFeed', () => {
	it('populates $feedMemes from API response', async () => {
		const memes = [makeMeme('m1'), makeMeme('m2')];
		mockFetch({ memes, next_cursor: 'cur1' });

		await loadFeed();

		expect($feedMemes.get()).toHaveLength(2);
		expect($feedMemes.get()[0].id).toBe('m1');
		expect($feedCursor.get()).toBe('cur1');
	});

	it('sets hasMore false when fewer than FEED_LIMIT memes returned', async () => {
		mockFetch({ memes: [makeMeme('m1')], next_cursor: null });

		await loadFeed();

		expect($feedHasMore.get()).toBe(false);
	});

	it('returns to idle loading state after completion', async () => {
		mockFetch({ memes: [], next_cursor: null });

		await loadFeed();

		expect($feedLoading.get()).toBe('idle');
	});

	it('handles API errors gracefully', async () => {
		mockFetch({ error: 'Server error' }, false);

		await loadFeed();

		expect($feedMemes.get()).toHaveLength(0);
		expect($feedHasMore.get()).toBe(false);
		expect($feedLoading.get()).toBe('idle');
	});

	it('prevents concurrent loads', async () => {
		const fetchSpy = mockFetch({
			memes: [makeMeme('m1')],
			next_cursor: null,
		});

		// Start two loads simultaneously
		const p1 = loadFeed();
		const p2 = loadFeed();
		await Promise.all([p1, p2]);

		// Only one fetch should have been made
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});
});

// ── loadMore ─────────────────────────────────────────────────────────

describe('loadMore', () => {
	it('appends memes to existing feed', async () => {
		$feedMemes.set([makeMeme('m1')]);
		$feedCursor.set('cur1');
		mockFetch({ memes: [makeMeme('m2')], next_cursor: 'cur2' });

		await loadMore();

		expect($feedMemes.get()).toHaveLength(2);
		expect($feedMemes.get()[1].id).toBe('m2');
		expect($feedCursor.get()).toBe('cur2');
	});

	it('does nothing when hasMore is false', async () => {
		$feedHasMore.set(false);
		const fetchSpy = mockFetch({ memes: [], next_cursor: null });

		await loadMore();

		expect(fetchSpy).not.toHaveBeenCalled();
	});
});

// ── reactToMeme (optimistic) ─────────────────────────────────────────

describe('reactToMeme', () => {
	it('optimistically adds reaction', () => {
		$feedMemes.set([makeMeme('m1', { reaction_count: 5 })]);
		mockFetch({ success: true });

		reactToMeme('m1', 3);

		expect($userReactions.get()['m1']).toBe(3);
		expect($feedMemes.get()[0].reaction_count).toBe(6);
	});

	it('toggles off when same reaction is sent', () => {
		$feedMemes.set([makeMeme('m1', { reaction_count: 5 })]);
		$userReactions.set({ m1: 3 });
		mockFetch({ success: true });

		reactToMeme('m1', 3);

		expect($userReactions.get()['m1']).toBeUndefined();
		expect($feedMemes.get()[0].reaction_count).toBe(4);
	});

	it('changes reaction without changing count', () => {
		$feedMemes.set([makeMeme('m1', { reaction_count: 5 })]);
		$userReactions.set({ m1: 1 });
		mockFetch({ success: true });

		reactToMeme('m1', 3);

		expect($userReactions.get()['m1']).toBe(3);
		// Count stays same — replacing existing reaction
		expect($feedMemes.get()[0].reaction_count).toBe(5);
	});

	it('rolls back on API failure', async () => {
		$feedMemes.set([makeMeme('m1', { reaction_count: 5 })]);
		mockFetch({ error: 'fail' }, false);

		reactToMeme('m1', 3);

		// Wait for the promise to reject and rollback
		await vi.waitFor(() => {
			expect($userReactions.get()['m1']).toBeUndefined();
			expect($feedMemes.get()[0].reaction_count).toBe(5);
		});
	});
});

// ── saveMeme / unsaveMeme (optimistic) ───────────────────────────────

describe('saveMeme', () => {
	it('optimistically adds save', () => {
		$feedMemes.set([makeMeme('m1', { save_count: 10 })]);
		mockFetch({ success: true });

		saveMeme('m1');

		expect($userSaves.get().has('m1')).toBe(true);
		expect($feedMemes.get()[0].save_count).toBe(11);
	});

	it('rolls back on API failure', async () => {
		$feedMemes.set([makeMeme('m1', { save_count: 10 })]);
		mockFetch({ error: 'fail' }, false);

		saveMeme('m1');

		await vi.waitFor(() => {
			expect($userSaves.get().has('m1')).toBe(false);
			expect($feedMemes.get()[0].save_count).toBe(10);
		});
	});
});

describe('unsaveMeme', () => {
	it('optimistically removes save', () => {
		$feedMemes.set([makeMeme('m1', { save_count: 10 })]);
		$userSaves.set(new Set(['m1']));
		mockFetch({ success: true });

		unsaveMeme('m1');

		expect($userSaves.get().has('m1')).toBe(false);
		expect($feedMemes.get()[0].save_count).toBe(9);
	});

	it('rolls back on API failure', async () => {
		$feedMemes.set([makeMeme('m1', { save_count: 10 })]);
		$userSaves.set(new Set(['m1']));
		mockFetch({ error: 'fail' }, false);

		unsaveMeme('m1');

		await vi.waitFor(() => {
			expect($userSaves.get().has('m1')).toBe(true);
			expect($feedMemes.get()[0].save_count).toBe(10);
		});
	});
});

// ── trackView ────────────────────────────────────────────────────────

describe('trackView', () => {
	it('fires API call for first view', async () => {
		const fetchSpy = mockFetch({ success: true });

		trackView('tv-1');

		// Wait for the fire-and-forget async chain to settle
		await vi.waitFor(() => {
			expect(fetchSpy).toHaveBeenCalledTimes(1);
		});
	});

	it('deduplicates — second call for same ID does not fetch', async () => {
		const fetchSpy = mockFetch({ success: true });

		trackView('tv-dedup');
		trackView('tv-dedup');

		await vi.waitFor(() => {
			expect(fetchSpy).toHaveBeenCalledTimes(1);
		});
	});
});

// ── trackShare ───────────────────────────────────────────────────────

describe('trackShare', () => {
	it('optimistically increments share count', () => {
		$feedMemes.set([makeMeme('m1', { share_count: 5 })]);
		mockFetch({ success: true });

		trackShare('m1');

		expect($feedMemes.get()[0].share_count).toBe(6);
	});

	it('rolls back on API failure', async () => {
		$feedMemes.set([makeMeme('m1', { share_count: 5 })]);
		mockFetch({ error: 'fail' }, false);

		trackShare('m1');

		await vi.waitFor(() => {
			expect($feedMemes.get()[0].share_count).toBe(5);
		});
	});
});
