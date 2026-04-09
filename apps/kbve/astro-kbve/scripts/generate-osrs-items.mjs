/**
 * Bootstrap new OSRS item MDX files from Wiki API
 *
 * This script creates MDX files for NEW items only — items that don't
 * already have an MDX file in the output directory. Existing MDX files
 * are the single source of truth and are never overwritten.
 *
 * Run: node scripts/generate-osrs-items.mjs [--force]
 *   --force: regenerate ALL items (overwrites existing files)
 */

import { writeFile, mkdir, readdir } from 'fs/promises';
import { join } from 'path';
import { stringify as stringifyYaml } from 'yaml';

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
 * Generate SEO description from item data
 */
function generateSEODescription(item) {
	const parts = [];

	if (item.examine && item.examine.length < 80) {
		parts.push(`${item.name}: ${item.examine}`);
	} else {
		parts.push(`${item.name} is ${item.members ? 'a members-only' : 'a free-to-play'} OSRS item`);
	}

	const priceInfo = [];
	if (item.highalch) priceInfo.push(`High alch: ${item.highalch.toLocaleString()} GP`);
	if (item.limit) priceInfo.push(`GE limit: ${item.limit.toLocaleString()}`);

	let description = parts.join(' ');
	if (priceInfo.length > 0) {
		const priceStr = `. ${priceInfo.join(', ')}.`;
		if (description.length + priceStr.length <= 160) {
			description += priceStr;
		}
	}

	if (!description.endsWith('.')) description += '.';
	if (description.length > 160) description = description.substring(0, 157) + '...';

	return description;
}

/**
 * Generate a v2 MDX file for a new item (bootstrap)
 * Creates minimal frontmatter with base Wiki data + v2 body
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
	console.log(`🎮 OSRS item bootstrap${forceAll ? ' (FORCE mode — overwrites all)' : ''}`);
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

	// Get existing MDX files to skip
	const existingFiles = new Set();
	if (!forceAll) {
		const files = await readdir(OUTPUT_DIR);
		for (const f of files) {
			if (f.endsWith('.mdx')) existingFiles.add(f);
		}
		console.log(`  📁 Found ${existingFiles.size} existing MDX files`);
	}

	const usedSlugs = new Set();
	let created = 0;
	let skippedNoName = 0;
	let skippedExisting = 0;

	for (const item of items) {
		if (!item.name) {
			skippedNoName++;
			continue;
		}

		let slug = nameToSlug(item.name);
		if (usedSlugs.has(slug)) slug = `${slug}-${item.id}`;
		usedSlugs.add(slug);

		const filename = `${slug}.mdx`;

		// Skip if file already exists (unless --force)
		if (!forceAll && existingFiles.has(filename)) {
			skippedExisting++;
			continue;
		}

		const mdx = generateNewItemMdx(item, slug);
		await writeFile(join(OUTPUT_DIR, filename), mdx, 'utf-8');
		created++;

		if (created <= 5) {
			console.log(`  + ${filename}`);
		} else if (created % 500 === 0) {
			console.log(`  ... created ${created} so far`);
		}
	}

	console.log(`\n✨ Done!`);
	console.log(`  Created: ${created} new items`);
	console.log(`  Skipped (existing): ${skippedExisting}`);
	console.log(`  Skipped (no name): ${skippedNoName}`);
}

main().catch((err) => {
	console.error('❌ Error:', err.message);
	process.exit(1);
});
