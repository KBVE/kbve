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

export interface FeedComment {
	id: string;
	author_id: string;
	body: string;
	parent_id: string | null;
	reaction_count: number;
	reply_count: number;
	created_at: string;
	author_name: string | null;
	author_avatar: string | null;
}

export interface CommentPage {
	comments: FeedComment[];
	nextCursor: string | null;
	hasMore: boolean;
}

export interface ReplyPage {
	replies: FeedComment[];
	nextCursor: string | null;
	hasMore: boolean;
}

export interface UserProfile {
	user_id: string;
	display_name: string | null;
	avatar_url: string | null;
	bio: string | null;
	total_memes: number;
	total_reactions_received: number;
	total_views_received: number;
	follower_count: number;
	following_count: number;
	joined_at: string;
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

/** Report reasons matching ReportReason enum (1-7) */
export const REPORT_REASONS = [
	{ key: 1, label: 'Spam' },
	{ key: 2, label: 'NSFW' },
	{ key: 3, label: 'Hate Speech' },
	{ key: 4, label: 'Harassment' },
	{ key: 5, label: 'Copyright' },
	{ key: 6, label: 'Misinformation' },
	{ key: 7, label: 'Other' },
] as const;

// ── Edge function response types ─────────────────────────────────────────

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

interface EdgeCommentListResponse {
	comments: FeedComment[];
	nextCursor: string | null;
	hasMore: boolean;
}

interface EdgeReplyListResponse {
	replies: FeedComment[];
	nextCursor: string | null;
	hasMore: boolean;
}

interface EdgeCommentCreateResponse {
	success: boolean;
	comment_id?: string;
	error?: string;
}

interface EdgeProfileResponse {
	profile: UserProfile | null;
}

interface EdgeProfileMemesResponse {
	memes: FeedMeme[];
	nextCursor: string | null;
	hasMore: boolean;
}

interface EdgeFollowResponse {
	success: boolean;
	is_new?: boolean;
	error?: string;
}

interface EdgeReportResponse {
	success: boolean;
	report_id: string | null;
	already_reported?: boolean;
}

// ── Feed ─────────────────────────────────────────────────────────────────

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

export async function trackView(memeId: string): Promise<void> {
	await callEdge<EdgeBoolResponse>('meme', {
		command: 'feed.view',
		meme_id: memeId,
	});
}

export async function trackShare(memeId: string): Promise<void> {
	await callEdge<EdgeBoolResponse>('meme', {
		command: 'feed.share',
		meme_id: memeId,
	});
}

// ── Reactions ────────────────────────────────────────────────────────────

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

// ── Saves ────────────────────────────────────────────────────────────────

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

// ── User State ───────────────────────────────────────────────────────────

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

// ── Comments ─────────────────────────────────────────────────────────────

export async function fetchComments(
	memeId: string,
	params: { limit?: number; cursor?: string | null } = {},
): Promise<CommentPage> {
	return callEdge<EdgeCommentListResponse>('meme', {
		command: 'comment.list',
		meme_id: memeId,
		limit: params.limit ?? 20,
		cursor: params.cursor ?? null,
	});
}

export async function fetchReplies(
	parentId: string,
	params: { limit?: number; cursor?: string | null } = {},
): Promise<ReplyPage> {
	return callEdge<EdgeReplyListResponse>('meme', {
		command: 'comment.replies',
		parent_id: parentId,
		limit: params.limit ?? 20,
		cursor: params.cursor ?? null,
	});
}

export async function createComment(
	memeId: string,
	body: string,
	parentId?: string | null,
): Promise<string> {
	const data = await callEdge<EdgeCommentCreateResponse>('meme', {
		command: 'comment.create',
		meme_id: memeId,
		body,
		parent_id: parentId ?? null,
	});
	return data.comment_id!;
}

export async function deleteComment(commentId: string): Promise<void> {
	await callEdge<EdgeBoolResponse>('meme', {
		command: 'comment.delete',
		comment_id: commentId,
	});
}

// ── Profiles ─────────────────────────────────────────────────────────────

export async function getProfile(
	userId: string,
): Promise<UserProfile | null> {
	const data = await callEdge<EdgeProfileResponse>('meme', {
		command: 'profile.get',
		user_id: userId,
	});
	return data.profile;
}

export async function updateProfile(fields: {
	display_name?: string;
	avatar_url?: string;
	bio?: string;
}): Promise<void> {
	await callEdge<EdgeBoolResponse>('meme', {
		command: 'profile.update',
		...fields,
	});
}

export async function getUserMemes(
	userId: string,
	params: { limit?: number; cursor?: string | null } = {},
): Promise<FeedPage> {
	return callEdge<EdgeProfileMemesResponse>('meme', {
		command: 'profile.memes',
		user_id: userId,
		limit: params.limit ?? 20,
		cursor: params.cursor ?? null,
	});
}

// ── Follows ──────────────────────────────────────────────────────────────

export async function followUser(userId: string): Promise<boolean> {
	const data = await callEdge<EdgeFollowResponse>('meme', {
		command: 'follow.add',
		following_id: userId,
	});
	return data.is_new ?? true;
}

export async function unfollowUser(userId: string): Promise<void> {
	await callEdge<EdgeBoolResponse>('meme', {
		command: 'follow.remove',
		following_id: userId,
	});
}

// ── Reports ──────────────────────────────────────────────────────────────

export async function reportMeme(
	memeId: string,
	reason: number,
	detail?: string,
): Promise<{ reportId: string | null; alreadyReported: boolean }> {
	const data = await callEdge<EdgeReportResponse>('meme', {
		command: 'report.create',
		meme_id: memeId,
		reason,
		detail: detail ?? null,
	});
	return {
		reportId: data.report_id,
		alreadyReported: data.already_reported ?? false,
	};
}
