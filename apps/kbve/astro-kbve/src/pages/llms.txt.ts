/**
 * /llms.txt — index file per https://llmstxt.org/.
 *
 * Short, link-heavy summary of the KBVE site so language models can navigate
 * without crawling JS-rendered pages. Pulls links + titles from the docs
 * collection at build time so additions show up automatically.
 *
 * The OpenAPI section enumerates the public HTTP surface served by axum-kbve
 * and points at /api/openapi.json + /dashboard/api/ for the live spec.
 *
 * Companion file /llms-full.txt holds the full doc corpus.
 */
import { getCollection } from 'astro:content';

const SITE = 'https://kbve.com';

interface DocSummary {
	slug: string;
	title: string;
	description: string;
	category: string;
}

/** Collect doc entries grouped by top-level category. */
async function collectDocsByCategory(): Promise<Map<string, DocSummary[]>> {
	const allDocs = await getCollection('docs');
	const byCategory = new Map<string, DocSummary[]>();

	for (const entry of allDocs) {
		const data = entry.data as Record<string, unknown>;
		const title = typeof data.title === 'string' ? data.title : '';
		if (!title) continue;

		const description =
			typeof data.description === 'string' ? data.description.trim() : '';

		const slug = entry.id;
		const segments = slug.split('/');
		const category = segments[0] ?? '';
		if (!category || category === 'index.mdx') continue;

		const list = byCategory.get(category) ?? [];
		list.push({ slug, title, description, category });
		byCategory.set(category, list);
	}

	for (const list of byCategory.values()) {
		list.sort((a, b) => a.title.localeCompare(b.title));
	}

	return byCategory;
}

/** Hand-curated list of public API endpoints. Mirror of the
 * `#[utoipa::path]` annotations in axum-kbve. The live spec is the source
 * of truth — this list exists so llms.txt stays self-contained without a
 * runtime fetch from the axum side. */
const API_ENDPOINTS: Array<{ method: string; path: string; summary: string }> =
	[
		{ method: 'GET', path: '/health', summary: 'Service liveness probe' },
		{
			method: 'GET',
			path: '/api/status',
			summary: 'Service status with uptime',
		},
		{
			method: 'GET',
			path: '/api/openapi.json',
			summary: 'OpenAPI 3.1 spec (machine-readable)',
		},
		{
			method: 'POST',
			path: '/api/v1/auth/game-token',
			summary:
				'Netcode ConnectToken for the game server (optional Supabase JWT)',
		},
		{
			method: 'GET',
			path: '/api/v1/profile/{username}',
			summary: 'Public user profile with provider enrichment',
		},
		{
			method: 'GET',
			path: '/api/v1/profile/me',
			summary: 'Authenticated caller profile (Bearer token)',
		},
		{
			method: 'POST',
			path: '/api/v1/profile/username',
			summary: 'Set username (Bearer token)',
		},
		{
			method: 'GET',
			path: '/api/v1/me',
			summary: 'Identity probe (user_id, username, is_staff)',
		},
		{
			method: 'GET',
			path: '/api/v1/me/staff',
			summary: 'Staff role bundle for caller',
		},
		{
			method: 'GET',
			path: '/api/v1/forum/spaces',
			summary: 'Active forum spaces',
		},
		{
			method: 'GET',
			path: '/api/v1/forum/tags',
			summary: 'Forum tags by popularity',
		},
		{
			method: 'GET',
			path: '/api/v1/osrs/{item_id}',
			summary: 'Old School RuneScape item price lookup',
		},
		{
			method: 'GET',
			path: '/api/v1/mc/players',
			summary: 'Minecraft players currently online',
		},
		{
			method: 'GET',
			path: '/api/v1/mc/textures/{hash}',
			summary: 'Minecraft skin texture proxy',
		},
		{
			method: 'POST',
			path: '/api/v1/telemetry/report',
			summary: 'Client-side error reporting (warn/error)',
		},
	];

/** Top-level categories surfaced in the docs section. Kept short by design;
 * the long tail lives in /llms-full.txt. */
const FEATURED_CATEGORIES = [
	'project',
	'application',
	'gdd',
	'journal',
	'company',
];

const CATEGORY_TITLES: Record<string, string> = {
	project: 'Projects',
	application: 'Application Stack',
	gdd: 'Game Design Documents',
	journal: 'Engineering Journal',
	company: 'Company',
};

const PER_CATEGORY_LIMIT = 30;

export const GET = async () => {
	const byCategory = await collectDocsByCategory();
	const lines: string[] = [];

	lines.push('# KBVE');
	lines.push('');
	lines.push(
		'> Open-source software collective and game studio. Builds web infrastructure, Minecraft mods, multiplayer games, and developer tooling. Operates a Kubernetes-managed stack on Talos backing kbve.com.',
	);
	lines.push('');
	lines.push(
		'KBVE runs the kbve.com website, a Discord community, multiple game projects (RareIcon, ChuckRPG, RentEarth, KBVE-MC), and the axum-kbve API. Source lives at https://github.com/KBVE/kbve.',
	);
	lines.push('');

	// Docs by category, top section first
	for (const cat of FEATURED_CATEGORIES) {
		const entries = byCategory.get(cat);
		if (!entries || entries.length === 0) continue;
		const heading = CATEGORY_TITLES[cat] ?? cat;
		lines.push(`## ${heading}`);
		lines.push('');
		const slice = entries.slice(0, PER_CATEGORY_LIMIT);
		for (const e of slice) {
			const url = `${SITE}/${e.slug}/`;
			const desc = e.description ? ` — ${e.description}` : '';
			lines.push(`- [${e.title}](${url})${desc}`);
		}
		if (entries.length > slice.length) {
			lines.push(
				`- ${entries.length - slice.length} more entries in this section — see [/llms-full.txt](${SITE}/llms-full.txt) for the full corpus`,
			);
		}
		lines.push('');
	}

	// API surface
	lines.push('## API');
	lines.push('');
	lines.push(
		`- [Interactive API reference](${SITE}/dashboard/api/) — Scalar-rendered live spec`,
	);
	lines.push(
		`- [OpenAPI 3.1 spec](${SITE}/api/openapi.json) — machine-readable JSON, generated by utoipa`,
	);
	lines.push('');
	lines.push('### Endpoints');
	lines.push('');
	for (const ep of API_ENDPOINTS) {
		lines.push(`- \`${ep.method} ${ep.path}\` — ${ep.summary}`);
	}
	lines.push('');

	// Optional / external
	lines.push('## Optional');
	lines.push('');
	lines.push(`- [GitHub repository](https://github.com/KBVE/kbve)`);
	lines.push(`- [Discord community](${SITE}/discord/)`);
	lines.push(`- [llms-full.txt](${SITE}/llms-full.txt) — full doc corpus`);
	lines.push('');

	const body = lines.join('\n');
	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'public, max-age=3600',
		},
	});
};
