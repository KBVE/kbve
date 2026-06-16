// Domain types for the job board frontend.
//
// These mirror the JSON the Rust/Axum API will eventually return (snake_case),
// so swapping the mock layer for real HTTP is a no-op for every consumer.
// Enum-ish integers carry the same meaning as the Postgres CHECK constraints
// (see packages/data/sql/schema/jobboard/jobboard.sql).

export interface Vertical {
	id: number;
	slug: string;
	label: string;
	description: string;
	status: number; // 0=inactive, 1=active, 2=featured
	sort_order: number;
}

// taxonomy.kind: 1=discipline, 2=tool, 3=skill
export type TaxonomyKind = 1 | 2 | 3;

export interface TaxonomyItem {
	id: number;
	vertical_id: number;
	kind: TaxonomyKind;
	name: string; // slug, e.g. "pixel-art"
	label: string; // display, e.g. "Pixel Art"
	status: number;
}

// gigs.budget_type: 0=unspecified, 1=fixed, 2=range, 3=hourly
export type BudgetType = 0 | 1 | 2 | 3;
// gigs.location_pref: 0=remote, 1=onsite, 2=hybrid
export type LocationPref = 0 | 1 | 2;
// gigs.status: 0=draft, 1=pending_review, 2=open, 4=filled, 8=closed, 16=expired
export type GigStatus = 0 | 1 | 2 | 4 | 8 | 16;

export interface PosterRef {
	handle: string;
	display_name: string;
	org_name: string;
	avatar_url: string;
}

// Shape returned by GET /api/gigs/:id (list returns the same minus description).
export interface Gig {
	id: string; // ULID
	vertical_id: number;
	vertical_slug: string;
	title: string;
	summary: string;
	description: string; // markdown
	budget_type: BudgetType;
	budget_min: number; // currency minor units (e.g. cents)
	budget_max: number;
	currency: string; // ISO-4217, e.g. "USD"
	deadline: string | null; // ISO timestamp
	location_pref: LocationPref;
	status: GigStatus;
	published_at: string | null;
	created_at: string;
	poster: PosterRef | null;
	// Joined taxonomy, split by kind for convenient rendering.
	disciplines: TaxonomyItem[];
	tools: TaxonomyItem[];
	skills: TaxonomyItem[];
	applicant_count: number;
}

// talent_profiles.availability: 0=open, 1=limited, 2=closed
export type Availability = 0 | 1 | 2;

export type MediaKind = 'image' | 'video' | 'youtube' | 'itch' | 'audio';

export interface Media {
	kind: MediaKind;
	url: string; // image src, mp4 src, youtube id, or itch embed url
	caption: string;
	poster_url?: string; // thumbnail for video/embed
}

export interface PortfolioItem {
	id: string;
	title: string;
	description: string;
	source: string; // "itch" | "youtube" | "image" | "repo" ... free-form label
	media: Media[];
	tags: TaxonomyItem[];
}

// Reputation ladder — game-flavored progression earned from real signals
// (completed engagements, studio vouches, jam wins). Ordered low → high.
export type RankTier =
	| 'recruit'
	| 'adventurer'
	| 'artisan'
	| 'veteran'
	| 'master'
	| 'legend';

export interface Rank {
	tier: RankTier;
	label: string;
	min_reputation: number;
}

export interface Badge {
	id: string;
	label: string;
	icon: string; // emoji glyph for now; swap for SVG sprites later
	description: string;
}

export interface TalentProfile {
	user_id: string;
	handle: string;
	display_name: string;
	avatar_url: string;
	headline: string;
	location: string;
	years_experience: number;
	availability: Availability;
	rate_min: number; // currency minor units
	rate_max: number;
	currency: string;
	vertical_slugs: string[];
	disciplines: TaxonomyItem[];
	tools: TaxonomyItem[];
	skills: TaxonomyItem[];
	reputation: number;
	rank: RankTier;
	badges: Badge[];
	rating_avg: number; // 0–5
	rating_count: number;
	portfolio: PortfolioItem[];
}

// ── List/filter contracts ──────────────────────────────────────────────

export interface GigQuery {
	q?: string;
	discipline?: string; // taxonomy slug
	tool?: string;
	skill?: string;
	location_pref?: LocationPref;
	budget_min?: number;
	cursor?: string;
}

export interface GigList {
	gigs: Gig[];
	next_cursor: string | null;
}

export interface TalentQuery {
	q?: string;
	discipline?: string;
	tool?: string;
	availability?: Availability;
}

export interface TalentList {
	talent: TalentProfile[];
	next_cursor: string | null;
}

export interface TaxonomyResponse {
	vertical_id: number;
	taxonomy: TaxonomyItem[];
}

// ── Mutation payloads ──────────────────────────────────────────────────

export interface CreateGigInput {
	title: string;
	summary: string;
	description: string;
	budget_type: BudgetType;
	budget_min: number; // currency minor units
	budget_max: number;
	currency: string;
	location_pref: LocationPref;
	deadline: string | null;
	tag_ids: number[]; // taxonomy ids (disciplines / tools / skills)
}

export interface ApplyInput {
	cover_message: string;
	proposed_rate: number; // currency minor units
	proposed_rate_type: BudgetType;
}

export interface Ack {
	success: boolean;
	message: string;
}
