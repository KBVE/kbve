/**
 * Pre-fetch OSRS Wiki pages as clean Markdown for v4 enrichment.
 *
 * Fetches the rendered article HTML from the OSRS Wiki parse API and converts
 * it to token-optimized Markdown with mdream, caching one file per item. This
 * lets enrichment subagents READ a local .md instead of doing a live WebFetch —
 * deterministic, full-fidelity, near-zero research tokens.
 *
 * Complements enrich-v3-wiki-stats.mjs (which pulls exact infobox NUMBERS);
 * this script provides the PROSE (mechanics, history, trivia) for about /
 * sections / faq / trivia.
 *
 * Run:
 *   node scripts/fetch-osrs-wiki-md.mjs <slug> [<slug> ...]
 *   node scripts/fetch-osrs-wiki-md.mjs --from-audit [--limit N]
 *   node scripts/fetch-osrs-wiki-md.mjs --slug earmuffs --out .cache/osrs-wiki
 *
 * Cached files land in scripts/.cache/osrs-wiki/<slug>.md (gitignored).
 */

import { readFile, writeFile, readdir, mkdir } from 'fs/promises';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { htmlToMarkdown } from 'mdream';

const CONTENT_DIR = './src/content/docs/osrs';
const WIKI_API = 'https://oldschool.runescape.wiki/api.php';
const WIKI_ORIGIN = 'https://oldschool.runescape.wiki';
const USER_AGENT = 'KBVE item_tracker - @h0lybyte on Discord';
const DEFAULT_OUT = './scripts/.cache/osrs-wiki';

const args = process.argv.slice(2);
const fromAudit = args.includes('--from-audit');
const outIdx = args.indexOf('--out');
const OUT_DIR = outIdx !== -1 ? args[outIdx + 1] : DEFAULT_OUT;
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

async function frontmatterFor(slug) {
	const raw = await readFile(join(CONTENT_DIR, `${slug}.mdx`), 'utf-8').catch(
		() => null,
	);
	if (!raw) return null;
	const m = raw.match(/^---\n([\s\S]*?)\n---/);
	if (!m) return null;
	try {
		return parseYaml(m[1])?.osrs ?? null;
	} catch {
		return null;
	}
}

async function fetchArticleHtml(name) {
	const title = name.replace(/ /g, '_');
	const url =
		`${WIKI_API}?action=parse&page=${encodeURIComponent(title)}` +
		`&prop=text&formatversion=2&format=json&redirects=1`;
	const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
	if (!res.ok) return null;
	const data = await res.json();
	return data?.parse?.text ?? null;
}

async function slugsFromArgs() {
	const explicit = args.filter((a, i) => {
		if (a.startsWith('--')) return false;
		if (args[i - 1] === '--out' || args[i - 1] === '--limit') return false;
		return true;
	});
	if (explicit.length > 0) return explicit;
	if (fromAudit) {
		const auditPath = '../../../docs/plans/osrs/audit.json';
		const audit = JSON.parse(await readFile(auditPath, 'utf-8'));
		return (audit.stubs ?? [])
			.filter((s) => !s.variant && s.name)
			.map((s) => s.slug);
	}
	return [];
}

async function main() {
	const slugs = await slugsFromArgs();
	if (slugs.length === 0) {
		console.error(
			'Usage: node scripts/fetch-osrs-wiki-md.mjs <slug...> | --from-audit [--limit N]',
		);
		process.exit(1);
	}
	await mkdir(OUT_DIR, { recursive: true });

	let done = 0;
	let failed = 0;
	for (const slug of slugs.slice(0, limit)) {
		const fm = await frontmatterFor(slug);
		const name = fm?.name;
		if (!name) {
			console.warn(`  skip ${slug}: no name in frontmatter`);
			failed++;
			continue;
		}
		const html = await fetchArticleHtml(name);
		if (!html) {
			console.warn(`  skip ${slug}: no Wiki page for "${name}"`);
			failed++;
			await sleep(400);
			continue;
		}
		const md = htmlToMarkdown(html, {
			origin: WIKI_ORIGIN,
			clean: true,
			filter: { exclude: ['table.navbox', 'div.navbox', 'sup.reference'] },
		});
		const header =
			`<!-- source: ${WIKI_ORIGIN}/w/${name.replace(/ /g, '_')} ` +
			`| CC BY-NC-SA 3.0 | fetched ${new Date().toISOString().slice(0, 10)} -->\n\n`;
		await writeFile(join(OUT_DIR, `${slug}.md`), header + md, 'utf-8');
		console.log(`  ok   ${slug} (${md.length} chars)`);
		done++;
		await sleep(400);
	}
	console.log(`\nDone: ${done} fetched, ${failed} skipped → ${OUT_DIR}`);
}

main();
