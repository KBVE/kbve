/**
 * Meme feed service layer.
 *
 * Currently returns mock data for UI development.
 * Swap implementations to gateway.rpc() when PostgREST / edge functions are ready.
 */

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

// ── Mock Data ────────────────────────────────────────────────────────────

const MOCK_MEMES: FeedMeme[] = [
	{
		id: '01JNMOCK0001',
		title: 'When the code compiles on the first try',
		format: 1,
		asset_url: 'https://picsum.photos/seed/meme1/800/1000',
		thumbnail_url: null,
		width: 800,
		height: 1000,
		tags: ['programming', 'reaction'],
		view_count: 12400,
		reaction_count: 843,
		comment_count: 56,
		save_count: 120,
		share_count: 34,
		created_at: '2026-02-27T10:00:00Z',
		author_name: 'h0lybyte',
		author_avatar: null,
	},
	{
		id: '01JNMOCK0002',
		title: 'Me explaining my code to a rubber duck',
		format: 1,
		asset_url: 'https://picsum.photos/seed/meme2/900/1200',
		thumbnail_url: null,
		width: 900,
		height: 1200,
		tags: ['programming', 'wholesome'],
		view_count: 8700,
		reaction_count: 621,
		comment_count: 42,
		save_count: 89,
		share_count: 21,
		created_at: '2026-02-27T09:30:00Z',
		author_name: 'memeLord42',
		author_avatar: null,
	},
	{
		id: '01JNMOCK0003',
		title: 'CSS is easy they said',
		format: 1,
		asset_url: 'https://picsum.photos/seed/meme3/1000/800',
		thumbnail_url: null,
		width: 1000,
		height: 800,
		tags: ['css', 'pain'],
		view_count: 23100,
		reaction_count: 1540,
		comment_count: 128,
		save_count: 310,
		share_count: 87,
		created_at: '2026-02-27T09:00:00Z',
		author_name: 'dankDev',
		author_avatar: null,
	},
	{
		id: '01JNMOCK0004',
		title: 'The deploy pipeline at 3am',
		format: 1,
		asset_url: 'https://picsum.photos/seed/meme4/800/800',
		thumbnail_url: null,
		width: 800,
		height: 800,
		tags: ['devops', 'cursed'],
		view_count: 5600,
		reaction_count: 390,
		comment_count: 31,
		save_count: 55,
		share_count: 12,
		created_at: '2026-02-27T08:30:00Z',
		author_name: 'nightOwl',
		author_avatar: null,
	},
	{
		id: '01JNMOCK0005',
		title: 'Git merge conflicts be like',
		format: 1,
		asset_url: 'https://picsum.photos/seed/meme5/750/1000',
		thumbnail_url: null,
		width: 750,
		height: 1000,
		tags: ['git', 'reaction'],
		view_count: 15800,
		reaction_count: 1120,
		comment_count: 74,
		save_count: 201,
		share_count: 53,
		created_at: '2026-02-27T08:00:00Z',
		author_name: 'rebaseKing',
		author_avatar: null,
	},
	{
		id: '01JNMOCK0006',
		title: 'When someone says they prefer tabs over spaces',
		format: 1,
		asset_url: 'https://picsum.photos/seed/meme6/900/900',
		thumbnail_url: null,
		width: 900,
		height: 900,
		tags: ['debate', 'fire'],
		view_count: 31200,
		reaction_count: 2100,
		comment_count: 256,
		save_count: 410,
		share_count: 120,
		created_at: '2026-02-27T07:30:00Z',
		author_name: 'spaceEnjoyer',
		author_avatar: null,
	},
	{
		id: '01JNMOCK0007',
		title: 'My code in production vs development',
		format: 1,
		asset_url: 'https://picsum.photos/seed/meme7/850/1100',
		thumbnail_url: null,
		width: 850,
		height: 1100,
		tags: ['programming', 'relatable'],
		view_count: 9400,
		reaction_count: 710,
		comment_count: 48,
		save_count: 95,
		share_count: 28,
		created_at: '2026-02-27T07:00:00Z',
		author_name: 'prodWarrior',
		author_avatar: null,
	},
	{
		id: '01JNMOCK0008',
		title: 'Stack Overflow copy paste speedrun any%',
		format: 1,
		asset_url: 'https://picsum.photos/seed/meme8/800/1000',
		thumbnail_url: null,
		width: 800,
		height: 1000,
		tags: ['stackoverflow', 'meta'],
		view_count: 18900,
		reaction_count: 1350,
		comment_count: 92,
		save_count: 245,
		share_count: 67,
		created_at: '2026-02-27T06:30:00Z',
		author_name: 'copyPasta',
		author_avatar: null,
	},
	{
		id: '01JNMOCK0009',
		title: 'Junior dev pushing to main',
		format: 1,
		asset_url: 'https://picsum.photos/seed/meme9/1000/1000',
		thumbnail_url: null,
		width: 1000,
		height: 1000,
		tags: ['git', 'cursed'],
		view_count: 27000,
		reaction_count: 1890,
		comment_count: 167,
		save_count: 380,
		share_count: 98,
		created_at: '2026-02-27T06:00:00Z',
		author_name: 'seniorDev',
		author_avatar: null,
	},
	{
		id: '01JNMOCK0010',
		title: 'This meeting could have been an email',
		format: 1,
		asset_url: 'https://picsum.photos/seed/meme10/900/1200',
		thumbnail_url: null,
		width: 900,
		height: 1200,
		tags: ['work', 'relatable'],
		view_count: 42100,
		reaction_count: 3200,
		comment_count: 310,
		save_count: 620,
		share_count: 180,
		created_at: '2026-02-27T05:30:00Z',
		author_name: 'officeHero',
		author_avatar: null,
	},
];

function delay(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

// ── Service Functions ────────────────────────────────────────────────────

export async function fetchFeed(params: FeedParams = {}): Promise<FeedPage> {
	// TODO: Replace with gateway.rpc('feed_published', { ... })
	await delay(600);

	const limit = params.limit ?? 5;
	const cursorIdx = params.cursor
		? MOCK_MEMES.findIndex((m) => m.id === params.cursor) + 1
		: 0;

	const slice = MOCK_MEMES.slice(cursorIdx, cursorIdx + limit);
	const hasMore = cursorIdx + limit < MOCK_MEMES.length;
	const nextCursor = slice.length > 0 ? slice[slice.length - 1].id : null;

	return { memes: slice, nextCursor: hasMore ? nextCursor : null, hasMore };
}

export async function reactToMeme(
	_memeId: string,
	_reaction: number,
): Promise<void> {
	// TODO: Replace with gateway.rpc('react_to_meme', { p_meme_id, p_reaction })
	await delay(200);
}

export async function removeReaction(_memeId: string): Promise<void> {
	// TODO: Replace with gateway.rpc('unreact_to_meme', { p_meme_id })
	await delay(200);
}

export async function saveMeme(_memeId: string): Promise<void> {
	// TODO: Replace with gateway.rpc('save_meme', { p_meme_id })
	await delay(200);
}

export async function unsaveMeme(_memeId: string): Promise<void> {
	// TODO: Replace with gateway.rpc('unsave_meme', { p_meme_id })
	await delay(200);
}

export async function getUserReactions(
	_memeIds: string[],
): Promise<Map<string, number>> {
	// TODO: Replace with gateway.rpc('get_user_reactions', { p_meme_ids })
	await delay(100);
	return new Map();
}

export async function getUserSaves(_memeIds: string[]): Promise<Set<string>> {
	// TODO: Replace with gateway.rpc('get_user_saves', { p_meme_ids })
	await delay(100);
	return new Set();
}
