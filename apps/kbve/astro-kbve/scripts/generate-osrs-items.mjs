/**
 * Bootstrap new OSRS item MDX files from Wiki API
 *
 * This script creates MDX files for NEW items only — items whose ID
 * doesn't already exist in any MDX file's frontmatter. Existing MDX
 * files are the single source of truth and are NEVER overwritten.
 * Slugs in existing files are preserved to protect SEO.
 *
 * "New" also excludes items collapsed onto a family base page. Those had their
 * MDX pruned on purpose and their URLs 301 at the axum layer, so they appear
 * nowhere as a top-level osrs.id — indexing only top-level ids made all 461 of
 * them look brand new and a run would have recreated every page the family
 * collapse deleted. Exclusion reads family rosters in frontmatter plus the
 * committed redirect table.
 *
 * Run: node scripts/generate-osrs-items.mjs [--audit]
 *   --audit: report which existing items have stale data vs Wiki API (no writes)
 */

import { writeFile, mkdir, readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const OSRS_MAPPING_URL = 'https://prices.runescape.wiki/api/v1/osrs/mapping';
const USER_AGENT = 'KBVE item_tracker - @h0lybyte on Discord';
const OUTPUT_DIR = './src/content/docs/osrs';
const REDIRECTS_PATH = fileURLToPath(
	new URL(
		'../../axum-kbve/src/transport/osrs_family_redirects.json',
		import.meta.url,
	),
);

const args = process.argv.slice(2);
const auditMode = args.includes('--audit');

const TODAY = new Date().toISOString().slice(0, 10);

/**
 * Convert item name to URL-safe slug
 */
function nameToSlug(name) {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

/**
 * Load the slugs that already 301/308 to a family base page.
 *
 * Collapsed variants (poison tiers, potion doses, Barrows degrade levels) have
 * their MDX deleted from disk and their URLs redirected at the axum layer. The
 * redirect table is the durable record of that collapse — families.json cannot
 * be, because it is regenerated from disk and pruning is one-way, so pruned
 * members vanish from it while their redirects live on.
 */
async function loadRedirectedSlugs() {
	try {
		const raw = await readFile(REDIRECTS_PATH, 'utf-8');
		const routes = JSON.parse(raw)?.routes ?? [];
		const slugs = new Set();
		for (const [source] of routes) {
			const slug = String(source).replace(/\/+$/, '').split('/').pop();
			if (slug) slugs.add(slug);
		}
		return slugs;
	} catch (err) {
		throw new Error(
			`Failed to read the family redirect table at ${REDIRECTS_PATH}. ` +
				'Refusing to generate: without it, every collapsed variant looks ' +
				`like a new item and would be resurrected. (${err.message})`,
		);
	}
}

/**
 * Build an index of item IDs that must never be regenerated.
 *
 * Two distinct sources, and both are required:
 *   1. Top-level `osrs.id` — items with their own MDX page.
 *   2. `osrs.family.members[].id` — variants collapsed onto a base page. Their
 *      own MDX was pruned, so they appear nowhere as a top-level id. Indexing
 *      only (1) makes all 461 of them look new, and a run would recreate every
 *      page the family collapse deliberately deleted.
 */
async function buildExistingIdIndex() {
	const ids = new Set();
	const collapsedIds = new Set();
	const slugsById = new Map();

	const files = await readdir(OUTPUT_DIR);
	const mdxFiles = files.filter((f) => f.endsWith('.mdx'));

	console.log(`  Indexing ${mdxFiles.length} existing MDX files by osrs.id...`);

	let indexed = 0;
	for (const file of mdxFiles) {
		try {
			const content = await readFile(join(OUTPUT_DIR, file), 'utf-8');
			const match = content.match(/^---\n([\s\S]*?)\n---/);
			if (!match) continue;

			const fm = parseYaml(match[1]);
			const id = fm?.osrs?.id;
			if (id !== undefined && id !== null) {
				ids.add(Number(id));
				slugsById.set(Number(id), fm.osrs.slug || file.replace('.mdx', ''));
				indexed++;
			}

			for (const member of fm?.osrs?.family?.members ?? []) {
				if (member?.id === undefined || member?.id === null) continue;
				collapsedIds.add(Number(member.id));
			}
		} catch {
			// Skip files that can't be parsed
		}

		if (indexed % 1000 === 0 && indexed > 0) {
			console.log(`    ... indexed ${indexed}`);
		}
	}

	console.log(`  📋 Indexed ${ids.size} unique item IDs`);
	console.log(`  🔗 Indexed ${collapsedIds.size} collapsed family member IDs`);
	return { ids, collapsedIds, slugsById };
}

/**
 * Generate SEO description from item data
 */
function generateSEODescription(item) {
	const parts = [];

	if (item.examine && item.examine.length < 80) {
		parts.push(`${item.name}: ${item.examine}`);
	} else {
		parts.push(
			`${item.name} is ${item.members ? 'a members-only' : 'a free-to-play'} OSRS item`,
		);
	}

	const priceInfo = [];
	if (item.highalch)
		priceInfo.push(`High alch: ${item.highalch.toLocaleString()} GP`);
	if (item.limit)
		priceInfo.push(`GE limit: ${item.limit.toLocaleString()}`);

	let description = parts.join(' ');
	if (priceInfo.length > 0) {
		const priceStr = `. ${priceInfo.join(', ')}.`;
		if (description.length + priceStr.length <= 160) {
			description += priceStr;
		}
	}

	if (!description.endsWith('.')) description += '.';
	if (description.length > 160)
		description = description.substring(0, 157) + '...';

	return description;
}

/**
 * Generate a v2 MDX file for a new item (bootstrap)
 */
function generateNewItemMdx(item, slug) {
	const osrsData = {
		id: item.id,
		name: item.name,
		slug,
		examine: item.examine || '',
		members: item.members ?? false,
		icon: item.icon || `${item.name}.png`,
		value: item.value ?? 0,
		lowalch: item.lowalch ?? null,
		highalch: item.highalch ?? null,
		limit: item.limit ?? null,
		mdx_version: 2,
		mdx_updated: TODAY,
	};

	const frontmatter = {
		title: `${item.name} | OSRS Price Data`,
		template: 'splash',
		description: generateSEODescription(item),
		osrs: osrsData,
	};

	const yaml = stringifyYaml(frontmatter, { lineWidth: 0, nullStr: 'null' });

	return `---
${yaml.trim()}
---

import OSRSItemPanel from '@/components/osrs/OSRSItemPanel.astro';
import OSRSAdsenseCard from '@/components/osrs/OSRSAdsenseCard.astro';

<OSRSItemPanel data={frontmatter.osrs} />

<OSRSAdsenseCard />
`;
}

async function main() {
	console.log(
		`🎮 OSRS item bootstrap${auditMode ? ' (AUDIT mode — read only)' : ''}`,
	);
	console.log('  Fetching item mapping from Wiki API...');

	const response = await fetch(OSRS_MAPPING_URL, {
		headers: { 'User-Agent': USER_AGENT },
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch OSRS mapping: ${response.status}`);
	}

	const items = await response.json();
	console.log(`  📦 Loaded ${items.length} items from API`);

	// Ensure output directory exists
	await mkdir(OUTPUT_DIR, { recursive: true });

	// Build ID index from existing MDX files
	const {
		ids: existingIds,
		collapsedIds,
		slugsById: existingSlugs,
	} = await buildExistingIdIndex();

	const redirectedSlugs = await loadRedirectedSlugs();
	console.log(`  ↪️  Loaded ${redirectedSlugs.size} redirected slugs`);

	// Track slugs to handle duplicates within this run
	const usedSlugs = new Set();
	for (const slug of existingSlugs.values()) {
		usedSlugs.add(slug);
	}

	let created = 0;
	let skippedNoName = 0;
	let skippedExisting = 0;
	let skippedCollapsed = 0;
	const staleItems = [];

	for (const item of items) {
		if (!item.name) {
			skippedNoName++;
			continue;
		}

		// Item already has an MDX file — never overwrite
		if (existingIds.has(item.id)) {
			skippedExisting++;

			// In audit mode, flag items where Wiki name differs from slug
			if (auditMode) {
				const existingSlug = existingSlugs.get(item.id);
				const wikiSlug = nameToSlug(item.name);
				if (existingSlug && existingSlug !== wikiSlug && !existingSlug.endsWith(`-${item.id}`)) {
					staleItems.push({
						id: item.id,
						wikiName: item.name,
						wikiSlug,
						existingSlug,
					});
				}
			}
			continue;
		}

		// Collapsed onto a family base page — its MDX was pruned on purpose and
		// its URL already redirects. Regenerating would undo the collapse and
		// shadow a live 301.
		if (collapsedIds.has(item.id)) {
			skippedCollapsed++;
			continue;
		}

		// New item — generate slug, avoid collisions
		let slug = nameToSlug(item.name);
		if (usedSlugs.has(slug)) slug = `${slug}-${item.id}`;

		if (redirectedSlugs.has(slug)) {
			skippedCollapsed++;
			continue;
		}

		usedSlugs.add(slug);

		const filename = `${slug}.mdx`;

		if (auditMode) {
			console.log(`  [new] ${filename} (id: ${item.id})`);
			created++;
			continue;
		}

		const mdx = generateNewItemMdx(item, slug);
		await writeFile(join(OUTPUT_DIR, filename), mdx, 'utf-8');
		created++;

		if (created <= 10) {
			console.log(`  + ${filename} (id: ${item.id})`);
		} else if (created % 500 === 0) {
			console.log(`  ... created ${created} so far`);
		}
	}

	console.log(`\n✨ Done!`);
	console.log(`  ${auditMode ? 'Would create' : 'Created'}: ${created} new items`);
	console.log(`  Skipped (existing ID): ${skippedExisting}`);
	console.log(`  Skipped (collapsed into a family): ${skippedCollapsed}`);
	console.log(`  Skipped (no name): ${skippedNoName}`);

	if (auditMode && staleItems.length > 0) {
		console.log(`\n⚠️  ${staleItems.length} items with slug/name mismatch (existing slug preserved for SEO):`);
		for (const s of staleItems.slice(0, 20)) {
			console.log(`  id:${s.id} wiki:"${s.wikiName}" slug:${s.existingSlug} (wiki would be: ${s.wikiSlug})`);
		}
		if (staleItems.length > 20) {
			console.log(`  ... and ${staleItems.length - 20} more`);
		}
	}
}

main().catch((err) => {
	console.error('❌ Error:', err.message);
	process.exit(1);
});
