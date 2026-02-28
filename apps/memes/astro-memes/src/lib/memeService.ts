/**
 * Meme feed service layer.
 *
 * Calls the meme edge function (Deno) which proxies to service-role SQL RPCs.
 * The edge function handles JWT verification and input validation.
 */

import { callEdge } from './supa';

// ── Types ────────────────────────────────────────────────────────────────

export interface FeedMeme {
	id: string;
	title: string | null;
	format: number;
	asset_url: string;
	thumbnail_url: string | null;
	width: number | null;
	height: number | null;
	tags: string[];
	view_count: number;
	reaction_count: number;
	comment_count: number;
	save_count: number;
	share_count: number;
	created_at: string;
	author_name: string | null;
	author_avatar: string | null;
}

export interface FeedPage {
	memes: FeedMeme[];
	nextCursor: string | null;
	hasMore: boolean;
}

export interface FeedParams {
	limit?: number;
	cursor?: string | null;
	tag?: string | null;
}

/** Reaction types matching ReactionType enum (1-indexed, 0 = unspecified) */
export const REACTIONS = [
	{ key: 1, emoji: '👍', label: 'Like' },
	{ key: 2, emoji: '👎', label: 'Dislike' },
	{ key: 3, emoji: '🔥', label: 'Fire' },
	{ key: 4, emoji: '💀', label: 'Skull' },
	{ key: 5, emoji: '😢', label: 'Cry' },
	{ key: 6, emoji: '🧢', label: 'Cap' },
] as const;

// ── Edge function command helper ─────────────────────────────────────────

interface EdgeFeedResponse {
	memes: FeedMeme[];
	nextCursor: string | null;
	hasMore: boolean;
}

interface EdgeReactResponse {
	success: boolean;
	meme_id?: string;
	error?: string;
}

interface EdgeBoolResponse {
	success: boolean;
	error?: string;
}

interface EdgeUserReactionsResponse {
	reactions: { meme_id: string; reaction: number }[];
}

interface EdgeUserSavesResponse {
	saves: string[];
}

// ── Service Functions ────────────────────────────────────────────────────

export async function fetchFeed(
	params: FeedParams = {},
): Promise<FeedPage> {
	const data = await callEdge<EdgeFeedResponse>('meme', {
		command: 'feed.list',
		limit: params.limit ?? 5,
		cursor: params.cursor ?? null,
		tag: params.tag ?? null,
	});

	return {
		memes: data.memes,
		nextCursor: data.nextCursor,
		hasMore: data.hasMore,
	};
}

export async function reactToMeme(
	memeId: string,
	reaction: number,
): Promise<void> {
	await callEdge<EdgeReactResponse>('meme', {
		command: 'reaction.add',
		meme_id: memeId,
		reaction,
	});
}

export async function removeReaction(memeId: string): Promise<void> {
	await callEdge<EdgeBoolResponse>('meme', {
		command: 'reaction.remove',
		meme_id: memeId,
	});
}

export async function saveMeme(memeId: string): Promise<void> {
	await callEdge<EdgeBoolResponse>('meme', {
		command: 'save.add',
		meme_id: memeId,
	});
}

export async function unsaveMeme(memeId: string): Promise<void> {
	await callEdge<EdgeBoolResponse>('meme', {
		command: 'save.remove',
		meme_id: memeId,
	});
}

export async function getUserReactions(
	memeIds: string[],
): Promise<Map<string, number>> {
	const data = await callEdge<EdgeUserReactionsResponse>('meme', {
		command: 'user.reactions',
		meme_ids: memeIds,
	});

	const map = new Map<string, number>();
	for (const r of data.reactions) {
		map.set(r.meme_id, r.reaction);
	}
	return map;
}

export async function getUserSaves(
	memeIds: string[],
): Promise<Set<string>> {
	const data = await callEdge<EdgeUserSavesResponse>('meme', {
		command: 'user.saves',
		meme_ids: memeIds,
	});

	return new Set(data.saves);
}
