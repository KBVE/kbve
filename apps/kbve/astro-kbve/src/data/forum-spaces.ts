/**
 * Build-time forum spaces fetch.
 *
 * Astro is SSG; this module is imported from .astro frontmatter and
 * the fetch resolves once during `astro build`. The result is baked
 * into the static output. axum-kbve serves the live JSON at
 * /api/v1/forum/spaces (cached 5min in-process); we hit prod by
 * default but allow override via KBVE_FORUM_API for local rigs.
 *
 * If the upstream is unreachable we fall back to a hardcoded mirror
 * of the seeded spaces so the build never breaks on a transient
 * outage.
 */

export interface ForumSpace {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	status: string;
}

const FALLBACK: ForumSpace[] = [
	{
		id: '',
		slug: 'announcements',
		name: 'Announcements',
		description: 'Site updates and announcements from the KBVE team.',
		status: 'active',
	},
	{
		id: '',
		slug: 'support',
		name: 'Support',
		description: 'Help and support for KBVE products.',
		status: 'active',
	},
];

const SOURCE =
	process.env.KBVE_FORUM_API ?? 'https://kbve.com/api/v1/forum/spaces';

let cached: ForumSpace[] | null = null;

export async function getForumSpaces(): Promise<ForumSpace[]> {
	if (cached) return cached;
	try {
		const res = await fetch(SOURCE, {
			signal: AbortSignal.timeout(5000),
			headers: { accept: 'application/json' },
		});
		if (!res.ok) throw new Error(`upstream ${res.status}`);
		const data = (await res.json()) as { spaces?: ForumSpace[] };
		cached = data.spaces && data.spaces.length > 0 ? data.spaces : FALLBACK;
	} catch (err) {
		console.warn(
			`[forum-spaces] ${SOURCE} unreachable, using fallback:`,
			err instanceof Error ? err.message : err,
		);
		cached = FALLBACK;
	}
	return cached;
}
