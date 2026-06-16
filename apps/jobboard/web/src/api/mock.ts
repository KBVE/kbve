// Mock data + mock query implementations.
//
// Everything here resolves the same JSON shapes the real API will return, so the
// seam in client.ts can flip from mock → HTTP without touching any component.
// Fixtures are game-dev themed; ids/slugs match the seed we'll ship to Postgres later.

import type {
	Ack,
	ApplyInput,
	Badge,
	CreateGigInput,
	Gig,
	GigList,
	GigQuery,
	Rank,
	RankTier,
	TalentList,
	TalentProfile,
	TalentQuery,
	TaxonomyItem,
	TaxonomyResponse,
	Vertical,
} from './types';

const GAME_DEV_ID = 1;

// Taxonomy is generated from the MDX source of truth (jobboard.mdx `verticals`
// block) via `nx run astro-kbve:sync:jobboard-taxonomy`. Same data the seed SQL
// loads into Postgres — mock and DB never drift.
import taxonomyData from './taxonomy.generated.json';

export const VERTICALS: Vertical[] = taxonomyData.verticals as Vertical[];

export const TAXONOMY: TaxonomyItem[] =
	taxonomyData.taxonomy as unknown as TaxonomyItem[];

const bySlug = new Map(TAXONOMY.map((t) => [t.name, t]));
/** Look up taxonomy items by slug; unknown slugs are ignored. */
const tax = (...slugs: string[]): TaxonomyItem[] =>
	slugs.map((s) => bySlug.get(s)).filter((t): t is TaxonomyItem => !!t);

// ── Reputation ladder ─────────────────────────────────────────────────────

export const RANKS: Record<RankTier, Rank> = {
	recruit: { tier: 'recruit', label: 'Recruit', min_reputation: 0 },
	adventurer: {
		tier: 'adventurer',
		label: 'Adventurer',
		min_reputation: 250,
	},
	artisan: { tier: 'artisan', label: 'Artisan', min_reputation: 750 },
	veteran: { tier: 'veteran', label: 'Veteran', min_reputation: 2000 },
	master: { tier: 'master', label: 'Master', min_reputation: 5000 },
	legend: { tier: 'legend', label: 'Legend', min_reputation: 12000 },
};

export const RANK_ORDER: RankTier[] = [
	'recruit',
	'adventurer',
	'artisan',
	'veteran',
	'master',
	'legend',
];

const BADGES: Record<string, Badge> = {
	shipped_console: {
		id: 'shipped_console',
		label: 'Shipped on Console',
		icon: '🎮',
		description: 'Credited on a title released for a console platform.',
	},
	jam_winner: {
		id: 'jam_winner',
		label: 'Jam Winner',
		icon: '🏆',
		description: 'Placed first in a sanctioned KBVE game jam.',
	},
	five_vouches: {
		id: 'five_vouches',
		label: '5 Studio Vouches',
		icon: '🛡️',
		description: 'Vouched for by five or more verified studios.',
	},
	fast_responder: {
		id: 'fast_responder',
		label: 'Fast Responder',
		icon: '⚡',
		description: 'Replies to most invitations within a day.',
	},
	verified: {
		id: 'verified',
		label: 'Vetted',
		icon: '✔️',
		description: 'Passed portfolio review — a sanctioned member.',
	},
};

// ── Posters ────────────────────────────────────────────────────────────

const POSTERS = {
	pixelforge: {
		handle: 'pixelforge',
		display_name: 'Mara Vale',
		org_name: 'PixelForge Studio',
		avatar_url: 'https://i.pravatar.cc/128?img=47',
	},
	nimbus: {
		handle: 'nimbus',
		display_name: 'Devon Ito',
		org_name: 'Nimbus Interactive',
		avatar_url: 'https://i.pravatar.cc/128?img=12',
	},
	aurora: {
		handle: 'auroragames',
		display_name: 'Priya Raman',
		org_name: 'Aurora Games',
		avatar_url: 'https://i.pravatar.cc/128?img=32',
	},
} as const;

// ── Gigs ───────────────────────────────────────────────────────────────

const now = Date.parse('2026-06-15T12:00:00Z');
const days = (n: number) => new Date(now + n * 86_400_000).toISOString();

export const GIGS: Gig[] = [
	{
		id: '01J8GIGPIXEL0001',
		vertical_id: GAME_DEV_ID,
		vertical_slug: 'game-dev',
		title: 'Pixel-art character set for a roguelite',
		summary: '12 animated heroes + enemies, 32×32, cohesive palette.',
		description:
			'We need a cohesive **pixel-art** character set for our roguelite: 12 playable heroes and ~20 enemies at 32×32, each with idle / run / attack / hurt animations. Style reference is *Dead Cells* meets *Enter the Gungeon*. Deliver as Aseprite sources + packed atlases.',
		budget_type: 2,
		budget_min: 320000,
		budget_max: 600000,
		currency: 'USD',
		deadline: days(45),
		location_pref: 0,
		status: 2,
		published_at: days(-3),
		created_at: days(-3),
		poster: POSTERS.pixelforge,
		disciplines: tax('2d-art', 'animation'),
		tools: tax('photoshop', 'spine'),
		skills: tax('pixel-art'),
		applicant_count: 14,
	},
	{
		id: '01J8GIGNET00002',
		vertical_id: GAME_DEV_ID,
		vertical_slug: 'game-dev',
		title: 'Unity netcode for a 4-player co-op shooter',
		summary: 'Authoritative server, lag comp, rollback for hitscan.',
		description:
			'Implement authoritative **netcode** for a 4-player PvE shooter in **Unity** (NGO or a custom transport — your call). Need client prediction, server reconciliation, and lag compensation for hitscan weapons. Vertical slice exists; you own the multiplayer layer.',
		budget_type: 3,
		budget_min: 9000,
		budget_max: 13000,
		currency: 'USD',
		deadline: days(60),
		location_pref: 0,
		status: 2,
		published_at: days(-1),
		created_at: days(-1),
		poster: POSTERS.nimbus,
		disciplines: tax('programming'),
		tools: tax('unity'),
		skills: tax('netcode'),
		applicant_count: 6,
	},
	{
		id: '01J8GIGSFX00003',
		vertical_id: GAME_DEV_ID,
		vertical_slug: 'game-dev',
		title: 'Adaptive combat music + SFX pack',
		summary: '3 layered combat tracks + 60 SFX, FMOD-ready.',
		description:
			'Compose 3 layered, adaptive combat tracks (calm → tension → climax) and a 60-piece **SFX** library for a stylized action game. Delivered **FMOD**-ready with implementation notes. Loop points and stems required.',
		budget_type: 1,
		budget_min: 450000,
		budget_max: 450000,
		currency: 'USD',
		deadline: days(30),
		location_pref: 0,
		status: 2,
		published_at: days(-5),
		created_at: days(-5),
		poster: POSTERS.aurora,
		disciplines: tax('audio'),
		tools: tax('fmod'),
		skills: [],
		applicant_count: 9,
	},
	{
		id: '01J8GIGSHADER4',
		vertical_id: GAME_DEV_ID,
		vertical_slug: 'game-dev',
		title: 'Stylized water + foliage shaders (URP)',
		summary: 'Shader Graph, mobile-friendly, gust + interaction.',
		description:
			'Author stylized water and foliage **shaders** in **Unity** URP via **Shader Graph**. Must run on mid-tier mobile, support wind gusts and player interaction (bend/trample). Provide a small demo scene.',
		budget_type: 1,
		budget_min: 280000,
		budget_max: 280000,
		currency: 'USD',
		deadline: days(25),
		location_pref: 2,
		status: 2,
		published_at: days(-2),
		created_at: days(-2),
		poster: POSTERS.nimbus,
		disciplines: tax('technical-art'),
		tools: tax('unity'),
		skills: tax('shader-graph'),
		applicant_count: 3,
	},
	{
		id: '01J8GIGQA000005',
		vertical_id: GAME_DEV_ID,
		vertical_slug: 'game-dev',
		title: 'One-week QA pass before Steam Next Fest',
		summary: 'Structured repro reports, Win/Steam Deck, daily builds.',
		description:
			'**QA** pass on our demo before Steam Next Fest: structured repro steps, severity tags, Windows + Steam Deck coverage, daily build turnaround. Bonus for controller-edge-case hunting.',
		budget_type: 1,
		budget_min: 120000,
		budget_max: 120000,
		currency: 'USD',
		deadline: days(12),
		location_pref: 0,
		status: 2,
		published_at: days(-1),
		created_at: days(-1),
		poster: POSTERS.pixelforge,
		disciplines: tax('qa'),
		tools: [],
		skills: tax('vertical-slice'),
		applicant_count: 21,
	},
	{
		id: '01J8GIG3D000006',
		vertical_id: GAME_DEV_ID,
		vertical_slug: 'game-dev',
		title: 'Hand-painted 3D props — fantasy tavern set',
		summary: '~40 game-ready props, stylized, Blender + Substance.',
		description:
			'Model and hand-paint ~40 stylized, game-ready props for a fantasy tavern (mugs, barrels, furniture, clutter). **Blender** + **Substance**. Trim sheets welcome. Match the attached concept sheet.',
		budget_type: 2,
		budget_min: 500000,
		budget_max: 850000,
		currency: 'USD',
		deadline: days(50),
		location_pref: 0,
		status: 2,
		published_at: days(-7),
		created_at: days(-7),
		poster: POSTERS.aurora,
		disciplines: tax('3d-art'),
		tools: tax('blender', 'substance'),
		skills: [],
		applicant_count: 11,
	},
];

// ── Talent ───────────────────────────────────────────────────────────────

export const TALENT: TalentProfile[] = [
	{
		user_id: 'usr_kira',
		handle: 'kira-px',
		display_name: 'Kira Sato',
		avatar_url: 'https://i.pravatar.cc/256?img=5',
		headline: 'Pixel artist & animator — juicy 2D action',
		location: 'Lisbon, PT',
		years_experience: 7,
		availability: 0,
		rate_min: 4500,
		rate_max: 7000,
		currency: 'USD',
		vertical_slugs: ['game-dev'],
		disciplines: tax('2d-art', 'animation'),
		tools: tax('photoshop', 'spine'),
		skills: tax('pixel-art'),
		reputation: 3200,
		rank: 'veteran',
		badges: [BADGES.verified, BADGES.shipped_console, BADGES.jam_winner],
		rating_avg: 4.9,
		rating_count: 38,
		portfolio: [
			{
				id: 'pf_kira_1',
				title: 'Skybound — combat reel',
				description:
					'Hero attack + dodge animations for a published roguelite.',
				source: 'youtube',
				media: [
					{
						kind: 'youtube',
						url: 'aqz-KE-bpKQ',
						caption: 'Combat animation reel (0:48)',
					},
				],
				tags: tax('animation', 'pixel-art'),
			},
			{
				id: 'pf_kira_2',
				title: 'Enemy roster — 32×32',
				description: 'Cohesive 24-enemy set, shared palette.',
				source: 'image',
				media: [
					{
						kind: 'image',
						url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&q=60',
						caption: 'Enemy sprite sheet',
					},
				],
				tags: tax('2d-art', 'pixel-art'),
			},
		],
	},
	{
		user_id: 'usr_arlo',
		handle: 'arlo-net',
		display_name: 'Arlo Becker',
		avatar_url: 'https://i.pravatar.cc/256?img=15',
		headline: 'Gameplay & netcode engineer (Unity / Bevy)',
		location: 'Berlin, DE',
		years_experience: 11,
		availability: 1,
		rate_min: 9000,
		rate_max: 14000,
		currency: 'USD',
		vertical_slugs: ['game-dev'],
		disciplines: tax('programming', 'technical-art'),
		tools: tax('unity', 'bevy'),
		skills: tax('netcode', 'procgen'),
		reputation: 6400,
		rank: 'master',
		badges: [BADGES.verified, BADGES.five_vouches, BADGES.fast_responder],
		rating_avg: 4.8,
		rating_count: 52,
		portfolio: [
			{
				id: 'pf_arlo_1',
				title: 'Rollback netcode demo (playable)',
				description:
					'Browser build — 2-player rollback fighting sandbox.',
				source: 'itch',
				media: [
					{
						kind: 'itch',
						url: 'https://itch.io/embed-upload/0000000?color=333333',
						caption: 'Click to play — rollback sandbox',
						poster_url:
							'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=1200&q=60',
					},
				],
				tags: tax('programming', 'netcode'),
			},
		],
	},
	{
		user_id: 'usr_juno',
		handle: 'juno-audio',
		display_name: 'Juno Park',
		avatar_url: 'https://i.pravatar.cc/256?img=24',
		headline: 'Adaptive game composer & sound designer',
		location: 'Seoul, KR',
		years_experience: 9,
		availability: 0,
		rate_min: 6000,
		rate_max: 9000,
		currency: 'USD',
		vertical_slugs: ['game-dev'],
		disciplines: tax('audio'),
		tools: tax('fmod', 'wwise'),
		skills: [],
		reputation: 2100,
		rank: 'veteran',
		badges: [BADGES.verified, BADGES.shipped_console],
		rating_avg: 5.0,
		rating_count: 19,
		portfolio: [
			{
				id: 'pf_juno_1',
				title: 'Adaptive boss theme — layered stems',
				description: 'Calm → tension → climax, FMOD-ready.',
				source: 'audio',
				media: [
					{
						kind: 'audio',
						url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
						caption: 'Boss theme (climax layer)',
					},
				],
				tags: tax('audio'),
			},
		],
	},
	{
		user_id: 'usr_remy',
		handle: 'remy-3d',
		display_name: 'Rémy Dubois',
		avatar_url: 'https://i.pravatar.cc/256?img=53',
		headline: 'Stylized 3D environment & prop artist',
		location: 'Montréal, CA',
		years_experience: 5,
		availability: 0,
		rate_min: 4000,
		rate_max: 6500,
		currency: 'USD',
		vertical_slugs: ['game-dev'],
		disciplines: tax('3d-art'),
		tools: tax('blender', 'zbrush', 'substance'),
		skills: [],
		reputation: 820,
		rank: 'artisan',
		badges: [BADGES.verified, BADGES.jam_winner],
		rating_avg: 4.7,
		rating_count: 12,
		portfolio: [
			{
				id: 'pf_remy_1',
				title: 'Fantasy tavern — prop kit',
				description: '40 hand-painted, game-ready props.',
				source: 'image',
				media: [
					{
						kind: 'image',
						url: 'https://images.unsplash.com/photo-1605792657660-596af9009e82?w=1200&q=60',
						caption: 'Tavern prop kit render',
					},
				],
				tags: tax('3d-art'),
			},
		],
	},
];

// ── Mock query implementations (latency-simulated) ─────────────────────────

const delay = <T>(value: T, ms = 220): Promise<T> =>
	new Promise((resolve) => setTimeout(() => resolve(value), ms));

const matches = (gig: Gig, query: GigQuery): boolean => {
	const q = query.q?.trim().toLowerCase();
	if (q) {
		const hay =
			`${gig.title} ${gig.summary} ${gig.description}`.toLowerCase();
		if (!hay.includes(q)) return false;
	}
	const hasTag = (slug: string | undefined, items: TaxonomyItem[]) =>
		!slug || items.some((t) => t.name === slug);
	if (!hasTag(query.discipline, gig.disciplines)) return false;
	if (!hasTag(query.tool, gig.tools)) return false;
	if (!hasTag(query.skill, gig.skills)) return false;
	if (
		query.location_pref !== undefined &&
		gig.location_pref !== query.location_pref
	)
		return false;
	if (query.budget_min !== undefined && gig.budget_max < query.budget_min)
		return false;
	return true;
};

export const mockApi = {
	verticals: () => delay({ verticals: VERTICALS }),

	taxonomy: (verticalId: number): Promise<TaxonomyResponse> =>
		delay({
			vertical_id: verticalId,
			taxonomy: TAXONOMY.filter((t) => t.vertical_id === verticalId),
		}),

	gigs: (query: GigQuery = {}): Promise<GigList> => {
		const gigs = GIGS.filter(
			(g) => g.status === 2 && matches(g, query),
		).sort(
			(a, b) =>
				Date.parse(b.published_at ?? b.created_at) -
				Date.parse(a.published_at ?? a.created_at),
		);
		return delay({ gigs, next_cursor: null });
	},

	gig: (id: string): Promise<Gig> => {
		const gig = GIGS.find((g) => g.id === id);
		if (!gig) return Promise.reject(new Error(`gig ${id} not found`));
		return delay(gig);
	},

	talent: (query: TalentQuery = {}): Promise<TalentList> => {
		const q = query.q?.trim().toLowerCase();
		const talent = TALENT.filter((t) => {
			if (
				q &&
				!`${t.display_name} ${t.headline}`.toLowerCase().includes(q)
			)
				return false;
			if (
				query.discipline &&
				!t.disciplines.some((d) => d.name === query.discipline)
			)
				return false;
			if (query.tool && !t.tools.some((d) => d.name === query.tool))
				return false;
			if (
				query.availability !== undefined &&
				t.availability !== query.availability
			)
				return false;
			return true;
		}).sort((a, b) => b.reputation - a.reputation);
		return delay({ talent, next_cursor: null });
	},

	talentByHandle: (handle: string): Promise<TalentProfile> => {
		const t = TALENT.find((x) => x.handle === handle);
		if (!t) return Promise.reject(new Error(`talent ${handle} not found`));
		return delay(t);
	},

	createGig: (input: CreateGigInput): Promise<Gig> => {
		const byId = new Map(TAXONOMY.map((t) => [t.id, t]));
		const picked = input.tag_ids
			.map((id) => byId.get(id))
			.filter((t): t is TaxonomyItem => !!t);
		const gig: Gig = {
			id: `01J8GIGNEW${(GIGS.length + 1).toString().padStart(4, '0')}`,
			vertical_id: GAME_DEV_ID,
			vertical_slug: 'game-dev',
			title: input.title,
			summary: input.summary,
			description: input.description,
			budget_type: input.budget_type,
			budget_min: input.budget_min,
			budget_max: input.budget_max,
			currency: input.currency,
			deadline: input.deadline,
			location_pref: input.location_pref,
			status: 2,
			published_at: days(0),
			created_at: days(0),
			poster: {
				handle: 'devuser',
				display_name: 'Dev User',
				org_name: 'Your Studio',
				avatar_url: 'https://i.pravatar.cc/128?img=68',
			},
			disciplines: picked.filter((t) => t.kind === 1),
			tools: picked.filter((t) => t.kind === 2),
			skills: picked.filter((t) => t.kind === 3),
			applicant_count: 0,
		};
		GIGS.unshift(gig);
		return delay(gig);
	},

	applyToGig: (gigId: string, _input: ApplyInput): Promise<Ack> => {
		const gig = GIGS.find((g) => g.id === gigId);
		if (gig) gig.applicant_count += 1;
		return delay({ success: true, message: 'Application sent' });
	},
};
