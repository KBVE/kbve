/**
 * Enrich v1 OSRS items and convert to v2
 *
 * Generates original `about` text from existing frontmatter data
 * (examine text, equipment stats, members status, requirements, etc.)
 * No external API calls — all enrichment derived from local data.
 *
 * Run: node scripts/enrich-v1-items.mjs [--dry-run] [--limit N]
 */

import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const OUTPUT_DIR = './src/content/docs/osrs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;

const TODAY = new Date().toISOString().slice(0, 10);

/**
 * Generate an original about description from item frontmatter.
 * Builds sentences from structured data — no Wiki text copying.
 */
function generateAbout(osrs) {
	const parts = [];
	const name = osrs.name;
	const membership = osrs.members ? 'members-only' : 'free-to-play';

	// Equipment items
	if (osrs.equipment) {
		const eq = osrs.equipment;
		const slot = eq.slot || 'equipment';
		const slotDesc = slot === '2h' ? 'two-handed weapon' : `${slot} slot item`;

		parts.push(`${name} is a ${membership} ${slotDesc} in Old School RuneScape.`);

		// Requirements
		const reqs = eq.requirements;
		if (reqs) {
			const reqParts = [];
			for (const [skill, level] of Object.entries(reqs)) {
				if (skill !== 'quest' && typeof level === 'number') {
					reqParts.push(`${level} ${skill.charAt(0).toUpperCase() + skill.slice(1)}`);
				}
			}
			if (reqParts.length > 0) {
				parts.push(`It requires ${reqParts.join(' and ')} to equip.`);
			}
		}

		// Notable stats
		const stats = [];
		if (eq.attack_bonus?.slash) stats.push(`+${eq.attack_bonus.slash} slash attack`);
		else if (eq.attack_bonus?.stab) stats.push(`+${eq.attack_bonus.stab} stab attack`);
		else if (eq.attack_bonus?.ranged) stats.push(`+${eq.attack_bonus.ranged} ranged attack`);
		else if (eq.attack_bonus?.magic) stats.push(`+${eq.attack_bonus.magic} magic attack`);

		if (eq.other_bonus?.melee_strength) stats.push(`+${eq.other_bonus.melee_strength} melee strength`);
		else if (eq.other_bonus?.ranged_strength) stats.push(`+${eq.other_bonus.ranged_strength} ranged strength`);

		if (eq.other_bonus?.prayer) stats.push(`+${eq.other_bonus.prayer} prayer bonus`);

		if (stats.length > 0) {
			parts.push(`It provides ${stats.join(', ')}.`);
		}

		if (eq.attack_speed) {
			parts.push(`Attack speed: ${eq.attack_speed} ticks (${(eq.attack_speed * 0.6).toFixed(1)}s).`);
		}

		return parts.join(' ');
	}

	// Potion items
	if (osrs.potion) {
		const p = osrs.potion;
		const doses = p.doses || 4;
		parts.push(`${name} is a ${membership} ${doses}-dose potion in Old School RuneScape.`);

		if (p.herblore_level) {
			parts.push(`It requires level ${p.herblore_level} Herblore to create.`);
		}

		if (p.effects && p.effects.length > 0) {
			const effectDescs = p.effects.map((e) => {
				if (e.boost_formula) return `${e.stat}: ${e.boost_formula}`;
				if (e.boost_type === 'percentage') return `${e.stat} +${e.boost_value}%`;
				return `${e.stat} +${e.boost_value}`;
			});
			parts.push(`Effects: ${effectDescs.join(', ')}.`);
		}

		return parts.join(' ');
	}

	// Food items
	if (osrs.food) {
		const f = osrs.food;
		parts.push(`${name} is a ${membership} food item in Old School RuneScape.`);

		if (f.heals) {
			parts.push(`It heals ${f.heals} hitpoints when eaten.`);
		} else if (f.heals_formula) {
			parts.push(`It heals based on: ${f.heals_formula}.`);
		}

		if (f.cooking_level) {
			parts.push(`Requires level ${f.cooking_level} Cooking to prepare.`);
		}

		if (f.overheal) {
			parts.push('This food can heal above maximum hitpoints.');
		}

		return parts.join(' ');
	}

	// Gathering items (woodcutting, mining, fishing)
	if (osrs.woodcutting || osrs.mining || osrs.fishing || osrs.gathering) {
		const g = osrs.woodcutting || osrs.mining || osrs.fishing || osrs.gathering;
		const skill = osrs.woodcutting ? 'Woodcutting' : osrs.mining ? 'Mining' : osrs.fishing ? 'Fishing' : (g.skill || 'gathering');

		parts.push(`${name} is a ${membership} item in Old School RuneScape.`);
		parts.push(`It can be obtained with level ${g.level} ${skill}, granting ${g.xp || '?'} experience.`);

		if (g.locations && g.locations.length > 0) {
			parts.push(`Notable locations: ${g.locations.join(', ')}.`);
		}

		return parts.join(' ');
	}

	// Prayer items
	if (osrs.prayer) {
		const pr = osrs.prayer;
		parts.push(`${name} is a ${membership} item used for Prayer training in Old School RuneScape.`);

		if (pr.xp_bury) {
			parts.push(`Burying grants ${pr.xp_bury} Prayer experience.`);
		}

		const bestXp = pr.xp_gilded_altar || pr.xp_gilded;
		if (bestXp) {
			parts.push(`Using a gilded altar with two burners grants ${bestXp} experience.`);
		}

		return parts.join(' ');
	}

	// Items with recipes
	if (osrs.recipes && osrs.recipes.length > 0) {
		const r = osrs.recipes[0];
		parts.push(`${name} is a ${membership} item in Old School RuneScape.`);

		if (r.skill && r.level) {
			const skillName = r.skill.charAt(0).toUpperCase() + r.skill.slice(1);
			parts.push(`It can be created with level ${r.level} ${skillName}.`);
		}

		if (r.product) {
			parts.push(`Used to create ${r.product}.`);
		}

		return parts.join(' ');
	}

	// Items with material classification
	if (osrs.material) {
		const m = osrs.material;
		const typeDesc = m.tier ? `${m.tier} tier ${m.type}` : m.type;
		parts.push(`${name} is a ${membership} ${typeDesc} in Old School RuneScape.`);
		return parts.join(' ');
	}

	// Generic fallback
	parts.push(`${name} is a ${membership} item in Old School RuneScape.`);

	if (osrs.highalch && osrs.highalch > 0) {
		parts.push(`High alchemy value: ${osrs.highalch.toLocaleString()} coins.`);
	}

	if (osrs.limit && osrs.limit > 0) {
		parts.push(`Grand Exchange buy limit: ${osrs.limit.toLocaleString()} per 4 hours.`);
	}

	return parts.join(' ');
}

/**
 * Parse an MDX file
 */
function parseMdx(content) {
	const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return null;
	try {
		return { frontmatter: parseYaml(match[1]), body: match[2].trim() };
	} catch {
		return null;
	}
}

/**
 * Check if a file is v1
 */
function isV1(parsed) {
	if (!parsed?.frontmatter?.osrs) return false;
	return (
		!parsed.frontmatter.osrs.mdx_version ||
		parsed.body.includes("from '@/components/astropad'")
	);
}

function v2Body() {
	return `import OSRSItemPanel from '@/components/osrs/OSRSItemPanel.astro';
import OSRSAdsenseCard from '@/components/osrs/OSRSAdsenseCard.astro';

<OSRSItemPanel data={frontmatter.osrs} />

<OSRSAdsenseCard />`;
}

async function main() {
	console.log(`🔄 Enriching v1 OSRS items${dryRun ? ' (DRY RUN)' : ''}`);
	if (limit < Infinity) console.log(`  Limit: ${limit} files`);

	const files = (await readdir(OUTPUT_DIR))
		.filter((f) => f.endsWith('.mdx'))
		.sort();

	console.log(`  📁 Found ${files.length} MDX files`);

	let enriched = 0;
	let skipped = 0;
	let processed = 0;

	for (const file of files) {
		if (processed >= limit) break;

		const filepath = join(OUTPUT_DIR, file);
		const content = await readFile(filepath, 'utf-8');
		const parsed = parseMdx(content);

		if (!parsed || !isV1(parsed)) {
			skipped++;
			continue;
		}

		const osrs = parsed.frontmatter.osrs;

		// Generate original about text from existing data
		if (!osrs.about) {
			osrs.about = generateAbout(osrs);
		}

		// Tag as v2
		osrs.mdx_version = 2;
		osrs.mdx_updated = TODAY;

		// Write v2
		const yaml = stringifyYaml(parsed.frontmatter, {
			lineWidth: 0,
			nullStr: 'null',
		});
		const output = `---\n${yaml.trim()}\n---\n\n${v2Body()}\n`;

		if (!dryRun) {
			await writeFile(filepath, output, 'utf-8');
		}

		enriched++;
		processed++;

		if (enriched <= 10 || enriched % 200 === 0) {
			const aboutLen = osrs.about?.length || 0;
			console.log(`  ✅ ${file} — about: ${aboutLen} chars`);
		}
	}

	console.log(`\n✨ Done!`);
	console.log(`  Enriched: ${enriched}`);
	console.log(`  Skipped (already v2): ${skipped}`);
}

main().catch((err) => {
	console.error('❌ Error:', err.message);
	process.exit(1);
});
