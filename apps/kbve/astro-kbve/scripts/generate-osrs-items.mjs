/**
 * Bootstrap new OSRS item MDX files from Wiki API
 *
 * This script creates MDX files for NEW items only — items whose ID
 * doesn't already exist in any MDX file's frontmatter. Existing MDX
 * files are the single source of truth and are never overwritten.
 * Slugs in existing files are preserved to protect SEO.
 *
 * Run: node scripts/generate-osrs-items.mjs [--force]
 *   --force: regenerate ALL items (overwrites existing files — destructive)
 */

import { writeFile, mkdir, readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const OSRS_MAPPING_URL = 'https://prices.runescape.wiki/api/v1/osrs/mapping';
const USER_AGENT = 'KBVE item_tracker - @h0lybyte on Discord';
const OUTPUT_DIR = './src/content/docs/osrs';

const args = process.argv.slice(2);
const forceAll = args.includes('--force');

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
 * Build an index of existing item IDs from MDX frontmatter.
 * Returns a Set of numeric IDs that already have MDX files.
 * This is the authoritative check — slug/filename doesn't matter.
 */
async function buildExistingIdIndex() {
	const ids = new Set();
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
		} catch {
			// Skip files that can't be parsed
		}

		if (indexed % 1000 === 0 && indexed > 0) {
			console.log(`    ... indexed ${indexed}`);
		}
	}

	console.log(`  📋 Indexed ${ids.size} unique item IDs`);
	return { ids, slugsById };
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
		`🎮 OSRS item bootstrap${forceAll ? ' (FORCE mode — overwrites all)' : ''}`,
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

	// Build ID index from existing MDX files (unless --force)
	let existingIds = new Set();
	let existingSlugs = new Map();
	if (!forceAll) {
		const index = await buildExistingIdIndex();
		existingIds = index.ids;
		existingSlugs = index.slugsById;
	}

	// Track slugs to handle duplicates within this run
	const usedSlugs = new Set();
	// Pre-populate with existing slugs so we don't collide
	for (const slug of existingSlugs.values()) {
		usedSlugs.add(slug);
	}

	let created = 0;
	let skippedNoName = 0;
	let skippedExisting = 0;

	for (const item of items) {
		if (!item.name) {
			skippedNoName++;
			continue;
		}

		// Skip if this item ID already has an MDX file
		if (!forceAll && existingIds.has(item.id)) {
			skippedExisting++;
			continue;
		}

		// Generate slug, avoid collisions with existing slugs
		let slug = nameToSlug(item.name);
		if (usedSlugs.has(slug)) slug = `${slug}-${item.id}`;
		usedSlugs.add(slug);

		const filename = `${slug}.mdx`;
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
	console.log(`  Created: ${created} new items`);
	console.log(`  Skipped (existing ID): ${skippedExisting}`);
	console.log(`  Skipped (no name): ${skippedNoName}`);
}

main().catch((err) => {
	console.error('❌ Error:', err.message);
	process.exit(1);
});
