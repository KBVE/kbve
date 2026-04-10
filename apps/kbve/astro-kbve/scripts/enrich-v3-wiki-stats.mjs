/**
 * Enrich v2 OSRS items to v3 with structured Wiki infobox data
 *
 * Fetches wikitext from OSRS Wiki API for items missing equipment stats,
 * parses Infobox Bonuses and Infobox Item templates, and populates
 * frontmatter fields (equipment bonuses, requirements, weight, etc.)
 *
 * Only enriches items that are missing structured data — never overwrites
 * existing curated fields.
 *
 * Run: node scripts/enrich-v3-wiki-stats.mjs [--dry-run] [--limit N]
 */

import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const OUTPUT_DIR = './src/content/docs/osrs';
const WIKI_API = 'https://oldschool.runescape.wiki/api.php';
const USER_AGENT = 'KBVE item_tracker - @h0lybyte on Discord';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;

const TODAY = new Date().toISOString().slice(0, 10);

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch wikitext for an item page
 */
async function fetchWikitext(itemName) {
	const title = itemName.replace(/ /g, '_');
	const url = `${WIKI_API}?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json`;

	try {
		const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
		if (!res.ok) return null;
		const data = await res.json();
		return data.parse?.wikitext?.['*'] || null;
	} catch {
		return null;
	}
}

/**
 * Parse a MediaWiki template from wikitext.
 * Returns key-value pairs of template parameters.
 */
function parseTemplate(wikitext, templateName) {
	// Find the template — handles nested templates
	const startPattern = `{{${templateName}`;
	const idx = wikitext.indexOf(startPattern);
	if (idx === -1) return null;

	// Extract template content (handle nested braces)
	let depth = 0;
	let start = idx;
	let end = idx;
	for (let i = idx; i < wikitext.length - 1; i++) {
		if (wikitext[i] === '{' && wikitext[i + 1] === '{') {
			depth++;
			i++;
		} else if (wikitext[i] === '}' && wikitext[i + 1] === '}') {
			depth--;
			i++;
			if (depth === 0) {
				end = i + 1;
				break;
			}
		}
	}

	const content = wikitext.slice(start + startPattern.length, end - 2);

	// Parse parameters (split by | at depth 0)
	const params = {};
	let current = '';
	let pDepth = 0;
	for (const char of content) {
		if (char === '{') pDepth++;
		else if (char === '}') pDepth--;
		else if (char === '[') pDepth++;
		else if (char === ']') pDepth--;

		if (char === '|' && pDepth === 0) {
			const eq = current.indexOf('=');
			if (eq !== -1) {
				const key = current.slice(0, eq).trim().toLowerCase();
				const val = current.slice(eq + 1).trim();
				if (key && val) params[key] = val;
			}
			current = '';
		} else {
			current += char;
		}
	}
	// Last parameter
	const eq = current.indexOf('=');
	if (eq !== -1) {
		const key = current.slice(0, eq).trim().toLowerCase();
		const val = current.slice(eq + 1).trim();
		if (key && val) params[key] = val;
	}

	return Object.keys(params).length > 0 ? params : null;
}

/**
 * Parse a numeric value, handling +/- prefixes
 */
function parseNum(val) {
	if (!val || val === 'N/A' || val === 'n/a') return null;
	const n = parseFloat(val.replace(/[+,]/g, ''));
	return isNaN(n) ? null : n;
}

/**
 * Extract equipment data from parsed infobox templates
 */
function extractEquipment(bonuses, item) {
	if (!bonuses) return null;

	const eq = {};

	// Slot
	if (bonuses.slot) eq.slot = bonuses.slot.toLowerCase().trim();

	// Attack speed
	const speed = parseNum(bonuses.speed);
	if (speed) eq.attack_speed = speed;

	// Attack range
	const range = parseNum(bonuses.attackrange);
	if (range) eq.attack_range = range;

	// Attack bonuses
	const ab = {};
	const astab = parseNum(bonuses.astab);
	const aslash = parseNum(bonuses.aslash);
	const acrush = parseNum(bonuses.acrush);
	const amagic = parseNum(bonuses.amagic);
	const arange = parseNum(bonuses.arange);
	if (astab !== null) ab.stab = astab;
	if (aslash !== null) ab.slash = aslash;
	if (acrush !== null) ab.crush = acrush;
	if (amagic !== null) ab.magic = amagic;
	if (arange !== null) ab.ranged = arange;
	if (Object.keys(ab).length > 0) eq.attack_bonus = ab;

	// Defence bonuses
	const db = {};
	const dstab = parseNum(bonuses.dstab);
	const dslash = parseNum(bonuses.dslash);
	const dcrush = parseNum(bonuses.dcrush);
	const dmagic = parseNum(bonuses.dmagic);
	const drange = parseNum(bonuses.drange);
	if (dstab !== null) db.stab = dstab;
	if (dslash !== null) db.slash = dslash;
	if (dcrush !== null) db.crush = dcrush;
	if (dmagic !== null) db.magic = dmagic;
	if (drange !== null) db.ranged = drange;
	if (Object.keys(db).length > 0) eq.defence_bonus = db;

	// Other bonuses
	const ob = {};
	const str = parseNum(bonuses.str);
	const rstr = parseNum(bonuses.rstr);
	const mdmg = parseNum(bonuses.mdmg);
	const prayer = parseNum(bonuses.prayer);
	if (str !== null) ob.melee_strength = str;
	if (rstr !== null) ob.ranged_strength = rstr;
	if (mdmg !== null) ob.magic_damage = mdmg;
	if (prayer !== null) ob.prayer = prayer;
	if (Object.keys(ob).length > 0) eq.other_bonus = ob;

	// Weight from Infobox Item
	if (item?.weight) {
		const w = parseFloat(item.weight);
		if (!isNaN(w)) eq.weight = w;
	}

	// Only return if we got meaningful data
	const hasStats =
		eq.attack_bonus || eq.defence_bonus || eq.other_bonus || eq.slot;
	return hasStats ? eq : null;
}

/**
 * Extract item properties from Infobox Item template
 */
function extractProperties(item) {
	if (!item) return null;
	const props = {};

	if (item.tradeable) props.tradeable = item.tradeable.toLowerCase() === 'yes';
	if (item.equipable) props.equipable = item.equipable.toLowerCase() === 'yes';
	if (item.stackable) props.stackable = item.stackable.toLowerCase() === 'yes';
	if (item.noteable) props.noteable = item.noteable.toLowerCase() === 'yes';
	if (item.members) props.members = item.members.toLowerCase() === 'yes';

	if (item.weight) {
		const w = parseFloat(item.weight);
		if (!isNaN(w)) props.weight = w;
	}

	if (item.quest && item.quest.toLowerCase() !== 'no') {
		props.quest = item.quest;
	}

	return Object.keys(props).length > 0 ? props : null;
}

/**
 * Check if an item needs v3 enrichment
 */
function needsEnrichment(osrs) {
	if (!osrs) return false;
	// Already v3
	if (osrs.mdx_version >= 3) return false;
	// Has no equipment data and looks like it could be equipable
	if (!osrs.equipment && !osrs.food && !osrs.potion) return true;
	return false;
}

/**
 * Generate enriched about text for items that now have equipment data
 */
function generateAbout(osrs) {
	const name = osrs.name;
	const membership = osrs.members ? 'members-only' : 'free-to-play';
	const parts = [];

	if (osrs.equipment) {
		const eq = osrs.equipment;
		const slot = eq.slot || 'equipment';
		const slotDesc =
			slot === '2h' ? 'two-handed weapon' : `${slot} slot item`;
		parts.push(
			`${name} is a ${membership} ${slotDesc} in Old School RuneScape.`,
		);

		const reqs = eq.requirements;
		if (reqs) {
			const rp = [];
			for (const [skill, level] of Object.entries(reqs)) {
				if (skill !== 'quest' && typeof level === 'number') {
					rp.push(
						`${level} ${skill.charAt(0).toUpperCase() + skill.slice(1)}`,
					);
				}
			}
			if (rp.length > 0) {
				parts.push(`It requires ${rp.join(' and ')} to equip.`);
			}
		}

		const stats = [];
		if (eq.attack_bonus?.slash)
			stats.push(`+${eq.attack_bonus.slash} slash attack`);
		else if (eq.attack_bonus?.stab)
			stats.push(`+${eq.attack_bonus.stab} stab attack`);
		else if (eq.attack_bonus?.ranged)
			stats.push(`+${eq.attack_bonus.ranged} ranged attack`);
		else if (eq.attack_bonus?.magic)
			stats.push(`+${eq.attack_bonus.magic} magic attack`);

		if (eq.other_bonus?.melee_strength)
			stats.push(`+${eq.other_bonus.melee_strength} melee strength`);
		else if (eq.other_bonus?.ranged_strength)
			stats.push(
				`+${eq.other_bonus.ranged_strength} ranged strength`,
			);

		if (stats.length > 0) parts.push(`It provides ${stats.join(', ')}.`);
	} else {
		parts.push(
			`${name} is a ${membership} item in Old School RuneScape.`,
		);
	}

	return parts.join(' ');
}

function parseMdx(content) {
	const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return null;
	try {
		return { frontmatter: parseYaml(match[1]), body: match[2].trim() };
	} catch {
		return null;
	}
}

function v2Body() {
	return `import OSRSItemPanel from '@/components/osrs/OSRSItemPanel.astro';
import OSRSAdsenseCard from '@/components/osrs/OSRSAdsenseCard.astro';

<OSRSItemPanel data={frontmatter.osrs} />

<OSRSAdsenseCard />`;
}

async function main() {
	console.log(
		`🔄 v3 enrichment — fetching Wiki infobox data${dryRun ? ' (DRY RUN)' : ''}`,
	);
	if (limit < Infinity) console.log(`  Limit: ${limit} items`);

	const files = (await readdir(OUTPUT_DIR))
		.filter((f) => f.endsWith('.mdx'))
		.sort();

	console.log(`  📁 Found ${files.length} MDX files`);

	let enriched = 0;
	let skipped = 0;
	let noWikiPage = 0;
	let noBonuses = 0;
	let processed = 0;

	for (const file of files) {
		if (processed >= limit) break;

		const filepath = join(OUTPUT_DIR, file);
		const content = await readFile(filepath, 'utf-8');
		const parsed = parseMdx(content);
		if (!parsed) continue;

		const osrs = parsed.frontmatter.osrs;
		if (!needsEnrichment(osrs)) {
			skipped++;
			continue;
		}

		// Fetch wikitext
		const wikitext = await fetchWikitext(osrs.name);
		if (!wikitext) {
			noWikiPage++;
			processed++;
			// Still tag as v3 (no wiki data available)
			osrs.mdx_version = 3;
			osrs.mdx_updated = TODAY;
			if (!dryRun) {
				const yaml = stringifyYaml(parsed.frontmatter, {
					lineWidth: 0,
					nullStr: 'null',
				});
				await writeFile(filepath, `---\n${yaml.trim()}\n---\n\n${v2Body()}\n`, 'utf-8');
			}
			continue;
		}

		// Parse infobox templates
		const bonuses = parseTemplate(wikitext, 'Infobox Bonuses');
		const itemBox = parseTemplate(wikitext, 'Infobox Item');

		// Extract equipment data
		const equipment = extractEquipment(bonuses, itemBox);
		const properties = extractProperties(itemBox);

		if (!equipment && !properties) {
			noBonuses++;
			// Still tag as v3
			osrs.mdx_version = 3;
			osrs.mdx_updated = TODAY;
			if (!dryRun) {
				const yaml = stringifyYaml(parsed.frontmatter, {
					lineWidth: 0,
					nullStr: 'null',
				});
				await writeFile(filepath, `---\n${yaml.trim()}\n---\n\n${v2Body()}\n`, 'utf-8');
			}
			processed++;
			continue;
		}

		// Merge — never overwrite existing
		if (equipment && !osrs.equipment) {
			osrs.equipment = equipment;
		}
		if (properties && !osrs.properties) {
			osrs.properties = properties;
		}

		// Regenerate about with new data
		osrs.about = generateAbout(osrs);

		// Tag as v3
		osrs.mdx_version = 3;
		osrs.mdx_updated = TODAY;

		if (!dryRun) {
			const yaml = stringifyYaml(parsed.frontmatter, {
				lineWidth: 0,
				nullStr: 'null',
			});
			await writeFile(filepath, `---\n${yaml.trim()}\n---\n\n${v2Body()}\n`, 'utf-8');
		}

		enriched++;
		processed++;

		if (enriched <= 10 || enriched % 25 === 0) {
			const hasEq = equipment ? 'equipment' : '';
			const hasProps = properties ? 'properties' : '';
			console.log(
				`  ✅ ${file} — ${[hasEq, hasProps].filter(Boolean).join(', ') || 'tagged only'}`,
			);
		}

		// Rate limit — 200ms between API calls
		await sleep(200);
	}

	console.log(`\n✨ Done!`);
	console.log(`  Enriched with stats: ${enriched}`);
	console.log(`  No wiki page: ${noWikiPage}`);
	console.log(`  No bonuses template: ${noBonuses}`);
	console.log(`  Skipped (already enriched): ${skipped}`);
	console.log(`  Total processed: ${processed}`);
}

main().catch((err) => {
	console.error('❌ Error:', err.message);
	process.exit(1);
});
