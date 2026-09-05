// ── Static category definitions ─────────────────────────────────────

export interface Category {
	id: string;
	label: string;
	icon: string;
	color: string;
}

export const CATEGORIES: Category[] = [
	{ id: 'gaming', label: 'Gaming', icon: 'gamepad-2', color: 'violet' },
	{ id: 'anime', label: 'Anime & Manga', icon: 'tv', color: 'pink' },
	{ id: 'music', label: 'Music', icon: 'music', color: 'blue' },
	{ id: 'tech', label: 'Technology', icon: 'cpu', color: 'cyan' },
	{ id: 'art', label: 'Art & Creative', icon: 'palette', color: 'amber' },
	{
		id: 'education',
		label: 'Education',
		icon: 'graduation-cap',
		color: 'green',
	},
	{ id: 'social', label: 'Social', icon: 'users', color: 'indigo' },
	{
		id: 'programming',
		label: 'Programming',
		icon: 'code',
		color: 'emerald',
	},
	{ id: 'memes', label: 'Memes & Humor', icon: 'smile', color: 'yellow' },
	{
		id: 'crypto',
		label: 'Crypto & Finance',
		icon: 'coins',
		color: 'orange',
	},
	{ id: 'roleplay', label: 'Roleplay', icon: 'swords', color: 'red' },
	{ id: 'nsfw', label: 'NSFW', icon: 'shield-alert', color: 'rose' },
];

export const CATEGORY_MAP = new Map(CATEGORIES.map((c) => [c.id, c]));

// ── Server card data ────────────────────────────────────────────────

export interface ServerCard {
	server_id: string;
	name: string;
	summary: string;
	icon_url: string | null;
	banner_url: string | null;
	invite_code: string;
	categories: string[];
	member_count: number;
	vote_count: number;
	is_online: boolean;
}

// ── Sort options ────────────────────────────────────────────────────

export type SortOption = 'votes' | 'members' | 'newest' | 'bumped';
