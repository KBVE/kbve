/**
 * Generate OSRS item MDX files from Wiki API
 * Run this as a prebuild step: node scripts/generate-osrs-items.mjs
 *
 * Features:
 * - Fetches item data from OSRS Wiki API
 * - Merges override frontmatter from data/osrs-overrides/_ITEMID.mdx
 * - Supports extended schema fields (equipment, potions, drop tables, etc.)
 */

import { writeFile, mkdir, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const OSRS_MAPPING_URL = 'https://prices.runescape.wiki/api/v1/osrs/mapping';
const USER_AGENT = 'KBVE item_tracker - @h0lybyte on Discord';
const OUTPUT_DIR = './src/content/docs/osrs';
const OVERRIDE_DIR = './data/osrs-overrides';

/**
 * Convert item name to URL-safe slug
 * "Dragon hunter crossbow" -> "dragon-hunter-crossbow"
 */
function nameToSlug(name) {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

/**
 * Parse override file and return both frontmatter data and markdown content
 * Override files are stored in data/osrs-overrides/_ITEMID.mdx
 *
 * @returns {{ frontmatter: object | null, content: string | null }}
 */
async function parseOverrideFile(itemId) {
	const overridePath = join(OVERRIDE_DIR, `_${itemId}.mdx`);
	if (!existsSync(overridePath)) {
		return { frontmatter: null, content: null };
	}

	const fileContent = await readFile(overridePath, 'utf-8');

	// Check for frontmatter (content between --- markers)
	const frontmatterMatch = fileContent.match(/^---\n([\s\S]*?)\n---\n?/);

	if (frontmatterMatch) {
		try {
			const frontmatter = parseYaml(frontmatterMatch[1]);
			const content = fileContent.slice(frontmatterMatch[0].length).trim();
			return { frontmatter, content: content || null };
		} catch (err) {
			console.warn(`⚠️ Failed to parse YAML in override for item ${itemId}: ${err.message}`);
			return { frontmatter: null, content: fileContent.trim() };
		}
	}

	return { frontmatter: null, content: fileContent.trim() };
}

/**
 * Deep merge two objects, with source values taking precedence
 */
function deepMerge(target, source) {
	const result = { ...target };

	for (const key of Object.keys(source)) {
		if (source[key] !== null && source[key] !== undefined) {
			if (
				typeof source[key] === 'object' &&
				!Array.isArray(source[key]) &&
				typeof target[key] === 'object' &&
				!Array.isArray(target[key])
			) {
				result[key] = deepMerge(target[key], source[key]);
			} else {
				result[key] = source[key];
			}
		}
	}

	return result;
}

/**
 * Generate an SEO-optimized description for an item
 * Includes price data, item type info, and key stats
 * Target: 150-160 characters for optimal SEO
 *
 * @param {object} item - Wiki API item data
 * @param {object} osrsData - Merged OSRS data (base + overrides)
 * @returns {string} SEO-optimized description
 */
function generateSEODescription(item, osrsData) {
	// If there's a custom meta description from override, use it
	if (osrsData.meta?.description) {
		return osrsData.meta.description;
	}

	const parts = [];
	const name = item.name;

	// Determine item type and add type-specific info
	if (osrsData.equipment) {
		// Equipment item
		const slot = osrsData.equipment.slot;
		const slotName = slot === '2h' ? 'two-handed weapon' : slot ? `${slot} slot item` : 'equipment';
		parts.push(`${name} is a ${item.members ? 'members' : 'F2P'} ${slotName}`);

		// Add key stat if available
		if (osrsData.equipment.other_bonus?.melee_strength) {
			parts.push(`with +${osrsData.equipment.other_bonus.melee_strength} melee strength`);
		} else if (osrsData.equipment.other_bonus?.ranged_strength) {
			parts.push(`with +${osrsData.equipment.other_bonus.ranged_strength} ranged strength`);
		} else if (osrsData.equipment.other_bonus?.magic_damage) {
			parts.push(`with ${osrsData.equipment.other_bonus.magic_damage}% magic damage`);
		}

		// Add requirement if notable
		const reqs = osrsData.equipment.requirements;
		if (reqs) {
			const reqLevel = reqs.attack || reqs.defence || reqs.ranged || reqs.magic;
			const reqSkill = reqs.attack ? 'Attack' : reqs.defence ? 'Defence' : reqs.ranged ? 'Ranged' : reqs.magic ? 'Magic' : null;
			if (reqLevel && reqSkill) {
				parts.push(`requiring ${reqLevel} ${reqSkill}`);
			}
		}
	} else if (osrsData.potion) {
		// Potion item
		const doses = osrsData.potion.doses || 4;
		parts.push(`${name} is a ${doses}-dose ${item.members ? 'members' : 'F2P'} potion`);
		if (osrsData.potion.effect) {
			parts.push(`that ${osrsData.potion.effect.toLowerCase()}`);
		}
	} else if (osrsData.food) {
		// Food item
		const heals = osrsData.food.heals;
		parts.push(`${name} is a ${item.members ? 'members' : 'F2P'} food item`);
		if (heals) {
			parts.push(`healing ${heals} HP`);
		}
	} else {
		// Generic item - use examine text or default
		if (item.examine && item.examine.length < 80) {
			parts.push(`${name}: ${item.examine}`);
		} else {
			parts.push(`${name} is ${item.members ? 'a members-only' : 'a free-to-play'} OSRS item`);
		}
	}

	// Add price info
	const priceInfo = [];
	if (item.highalch) {
		priceInfo.push(`High alch: ${item.highalch.toLocaleString()} GP`);
	}
	if (item.limit) {
		priceInfo.push(`GE limit: ${item.limit.toLocaleString()}`);
	}

	let description = parts.join(' ');

	// Add price info if it fits within character limit
	if (priceInfo.length > 0) {
		const priceStr = `. ${priceInfo.join(', ')}.`;
		if (description.length + priceStr.length <= 160) {
			description += priceStr;
		} else if (priceInfo[0] && description.length + priceInfo[0].length + 3 <= 160) {
			// Just add high alch if full price info doesn't fit
			description += `. ${priceInfo[0]}.`;
		}
	}

	// Ensure description ends properly
	if (!description.endsWith('.')) {
		description += '.';
	}

	// Truncate if still too long (shouldn't happen often)
	if (description.length > 160) {
		description = description.substring(0, 157) + '...';
	}

	return description;
}

/**
 * Build the base OSRS data object from Wiki API item
 */
function buildBaseOsrsData(item, slug) {
	return {
		id: item.id,
		name: item.name,
		slug: slug,
		examine: item.examine || '',
		members: item.members ?? false,
		icon: item.icon || `${item.name}.png`,
		value: item.value ?? 0,
		lowalch: item.lowalch ?? null,
		highalch: item.highalch ?? null,
		limit: item.limit ?? null,
	};
}

/**
 * Generate MDX content for an OSRS item
 * Merges base Wiki data with override frontmatter
 */
async function generateMdx(item, overrideFrontmatter, overrideContent) {
	const slug = nameToSlug(item.name);

	// Build base OSRS data
	const baseOsrsData = buildBaseOsrsData(item, slug);

	// Merge with override frontmatter if present
	const osrsData = overrideFrontmatter
		? deepMerge(baseOsrsData, overrideFrontmatter)
		: baseOsrsData;

	// Generate SEO-optimized description
	const description = generateSEODescription(item, osrsData);

	// Build the complete frontmatter object
	const frontmatter = {
		title: `${item.name} | OSRS Price Data`,
		description: description,
		osrs: osrsData,
	};

	// Convert frontmatter to YAML
	const yamlContent = stringifyYaml(frontmatter, {
		lineWidth: 0, // Don't wrap lines
		nullStr: 'null',
	});

	return `---
${yamlContent.trim()}
---

import OSRSItemPanel from '@/components/osrs/OSRSItemPanel.astro';
import { Adsense } from '@/components/astropad';

<OSRSItemPanel data={frontmatter.osrs} />

## About {frontmatter.osrs.name}

**{frontmatter.osrs.name}** is ${item.members ? 'a members-only' : 'a free-to-play'} item in Old School RuneScape.

> "{frontmatter.osrs.examine}"

## Item Details

- **Item ID:** {frontmatter.osrs.id}
- **Members:** {frontmatter.osrs.members ? 'Yes' : 'No'}
- **Store Value:** {frontmatter.osrs.value?.toLocaleString()} GP
${item.highalch ? `- **High Alch:** {frontmatter.osrs.highalch?.toLocaleString()} GP` : ''}
${item.lowalch ? `- **Low Alch:** {frontmatter.osrs.lowalch?.toLocaleString()} GP` : ''}
${item.limit ? `- **GE Limit:** {frontmatter.osrs.limit?.toLocaleString()} per 4 hours` : ''}
${overrideContent ? `
${overrideContent}
` : ''}
<Adsense />
`;
}

async function main() {
	console.log('🎮 Fetching OSRS item mapping from Wiki API...');

	const response = await fetch(OSRS_MAPPING_URL, {
		headers: { 'User-Agent': USER_AGENT },
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch OSRS mapping: ${response.status}`);
	}

	const items = await response.json();
	console.log(`📦 Loaded ${items.length} items from API`);

	// Clean output directory
	if (existsSync(OUTPUT_DIR)) {
		console.log('🧹 Cleaning existing OSRS directory...');
		await rm(OUTPUT_DIR, { recursive: true });
	}
	await mkdir(OUTPUT_DIR, { recursive: true });

	// Track slugs to handle duplicates
	const usedSlugs = new Set();
	let generated = 0;
	let skipped = 0;

	let withOverrides = 0;
	let withFrontmatter = 0;

	for (const item of items) {
		if (!item.name) {
			skipped++;
			continue;
		}

		let slug = nameToSlug(item.name);

		// Handle duplicate slugs by appending item ID
		if (usedSlugs.has(slug)) {
			slug = `${slug}-${item.id}`;
		}
		usedSlugs.add(slug);

		// Parse override file (extracts both frontmatter and content)
		const { frontmatter: overrideFrontmatter, content: overrideContent } =
			await parseOverrideFile(item.id);

		if (overrideContent || overrideFrontmatter) {
			withOverrides++;
		}
		if (overrideFrontmatter) {
			withFrontmatter++;
		}

		const mdxContent = await generateMdx(item, overrideFrontmatter, overrideContent);
		const filePath = join(OUTPUT_DIR, `${slug}.mdx`);

		await writeFile(filePath, mdxContent, 'utf-8');
		generated++;

		// Progress indicator every 1000 items
		if (generated % 1000 === 0) {
			console.log(`  ✅ Generated ${generated} items...`);
		}
	}

	console.log(`\n✨ Done! Generated ${generated} MDX files, skipped ${skipped} invalid items`);
	console.log(`📝 Items with overrides: ${withOverrides}`);
	console.log(`📊 Items with extended frontmatter: ${withFrontmatter}`);
	console.log(`📁 Output: ${OUTPUT_DIR}`);
}

main().catch((err) => {
	console.error('❌ Error:', err.message);
	process.exit(1);
});
