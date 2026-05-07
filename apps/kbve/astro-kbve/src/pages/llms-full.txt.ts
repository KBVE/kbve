/**
 * /llms-full.txt — full doc corpus per https://llmstxt.org/.
 *
 * Concatenates every entry in the docs collection so language models can
 * ingest the site without the JS-rendered Starlight chrome. Each entry is
 * separated by an `---` delimiter with title + URL header so models can
 * cite individual pages.
 *
 * Body extraction is best-effort: we use entry.body (raw MDX text) and
 * leave imports/JSX tags in place. Full HTML cleanup would be a layer of
 * regex tax for marginal quality gain — most docs are mostly markdown
 * already. Models tolerate the noise.
 *
 * The shorter index lives at /llms.txt.
 */
import { getCollection } from 'astro:content';

const SITE = 'https://kbve.com';

interface DocEntry {
	slug: string;
	title: string;
	description: string;
	body: string;
}

/** Categories whose body content we ship in full. itemdb / npcdb / mapdb /
 * questdb collections are excluded — they are data tables, not narrative
 * docs, and would balloon the file without helping comprehension. */
const INCLUDED_CATEGORY_PREFIXES = [
	'project/',
	'application/',
	'gdd/',
	'journal/',
	'company/',
	'arcade/',
	'crypto/',
	'forum/',
	'help/',
];

const MAX_BODY_CHARS = 60_000;

function shouldInclude(slug: string): boolean {
	return INCLUDED_CATEGORY_PREFIXES.some((prefix) => slug.startsWith(prefix));
}

function truncate(s: string, max: number): string {
	if (s.length <= max) return s;
	return `${s.slice(0, max)}\n\n[…truncated, full source at MDX]`;
}

async function collectEntries(): Promise<DocEntry[]> {
	const allDocs = await getCollection('docs');
	const out: DocEntry[] = [];

	for (const entry of allDocs) {
		const slug = entry.id;
		if (!shouldInclude(slug)) continue;
		if (slug.endsWith('index.mdx')) continue;

		const data = entry.data as Record<string, unknown>;
		const title = typeof data.title === 'string' ? data.title : slug;
		const description =
			typeof data.description === 'string' ? data.description.trim() : '';

		// entry.body holds the raw MDX text. Astro 6 still exposes this on
		// content collection entries that use the glob/docsLoader.
		const body =
			typeof (entry as { body?: unknown }).body === 'string'
				? truncate(
						(entry as { body: string }).body.trim(),
						MAX_BODY_CHARS,
					)
				: '';

		out.push({ slug, title, description, body });
	}

	out.sort((a, b) => a.slug.localeCompare(b.slug));
	return out;
}

export const GET = async () => {
	const entries = await collectEntries();

	const header: string[] = [
		'# KBVE — full doc corpus',
		'',
		'> Concatenated body text of every long-form doc on kbve.com. Page metadata + index live at /llms.txt.',
		'',
		`Generated at build time from the Astro \`docs\` content collection. ${entries.length} entries included; itemdb / npcdb / mapdb / questdb data tables are excluded (see /api/itemdb.json etc. for those).`,
		'',
		'---',
		'',
	];

	const blocks: string[] = [];
	for (const e of entries) {
		const url = `${SITE}/${e.slug}/`;
		const block: string[] = [];
		block.push(`# ${e.title}`);
		if (e.description) {
			block.push('');
			block.push(`> ${e.description}`);
		}
		block.push('');
		block.push(`Source: ${url}`);
		block.push('');
		if (e.body) {
			block.push(e.body);
			block.push('');
		}
		block.push('---');
		block.push('');
		blocks.push(block.join('\n'));
	}

	const body = header.join('\n') + blocks.join('');
	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'public, max-age=3600',
		},
	});
};
