/**
 * Build-time top-tags fetch. Same pattern as forum-spaces.ts —
 * resolves once at `astro build` and bakes the result into the
 * static output. Falls back to an empty list when the upstream is
 * unreachable so the build never breaks.
 */

export interface ForumTag {
	id: number;
	slug: string;
	name: string;
	description: string | null;
	thread_count: number;
}

const SOURCE =
	process.env.KBVE_FORUM_TAGS_API ?? 'https://kbve.com/api/v1/forum/tags';

let cached: ForumTag[] | null = null;

export async function getForumTopTags(limit = 12): Promise<ForumTag[]> {
	if (cached) return cached.slice(0, limit);
	try {
		const res = await fetch(SOURCE, {
			signal: AbortSignal.timeout(5000),
			headers: { accept: 'application/json' },
		});
		if (!res.ok) throw new Error(`upstream ${res.status}`);
		const data = (await res.json()) as { tags?: ForumTag[] };
		cached = Array.isArray(data.tags) ? data.tags : [];
	} catch (err) {
		console.warn(
			`[forum-tags] ${SOURCE} unreachable, using empty fallback:`,
			err instanceof Error ? err.message : err,
		);
		cached = [];
	}
	return cached.slice(0, limit);
}
