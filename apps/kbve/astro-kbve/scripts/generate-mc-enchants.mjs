/**
 * Bootstrap new Minecraft enchant MDX files from the
 * PrismarineJS/minecraft-data registry. Skips enchants whose MDX already
 * exists (matched by `mc_enchant.ref` in frontmatter). Generates a
 * minimal frontmatter block that validates against McEnchantSchema; rich
 * descriptions and rarity tuning are left for manual enrichment.
 *
 * Run: node scripts/generate-mc-enchants.mjs
 *   --audit   print would-be new MDX files; no writes
 */

import { mkdir, readdir, readFile, writeFile, stat } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const VERSION = '1.21.5';
const DATA_URL = `https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pc/${VERSION}/enchantments.json`;
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, '../src/content/docs/mc/enchants');

const args = process.argv.slice(2);
const auditMode = args.includes('--audit');

// Map upstream `category` strings → schema MCEnchantTarget enum.
// Upstream uses gameplay buckets (e.g. `sharp_weapon`, `mining_loot`)
// that don't appear in our proto enum — fold them into the closest
// existing target. `equippable` and `durability` apply to anything that
// can be worn / broken, so they map to the catch-all `wearable` /
// `breakable` targets. `vanishing` (curse of vanishing) maps to
// `vanishable`.
const CATEGORY_TO_TARGET = {
	armor: 'armor',
	head_armor: 'armor_head',
	chest_armor: 'armor_chest',
	leg_armor: 'armor_legs',
	foot_armor: 'armor_feet',
	weapon: 'weapon',
	sword: 'weapon',
	sharp_weapon: 'weapon',
	mace: 'mace',
	mining: 'digger',
	mining_loot: 'digger',
	digger: 'digger',
	fire_aspect: 'weapon',
	fishing: 'fishing_rod',
	fishing_rod: 'fishing_rod',
	trident: 'trident',
	crossbow: 'crossbow',
	bow: 'bow',
	wearable: 'wearable',
	equippable: 'wearable',
	breakable: 'breakable',
	durability: 'breakable',
	vanishable: 'vanishable',
	vanishing: 'vanishable',
};

function refToSlug(ref) {
	return ref.replace(/_/g, '-');
}

async function exists(path) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function buildExistingRefIndex() {
	const refs = new Set();
	if (!(await exists(OUTPUT_DIR))) return refs;
	const walk = async (dir) => {
		for (const name of await readdir(dir)) {
			const full = join(dir, name);
			const s = await stat(full);
			if (s.isDirectory()) {
				await walk(full);
			} else if (name.endsWith('.mdx')) {
				const txt = await readFile(full, 'utf-8');
				const m = txt.match(/^---\n([\s\S]*?)\n---/);
				if (!m) continue;
				try {
					const fm = parseYaml(m[1]);
					const ref = fm?.mc_enchant?.ref;
					if (typeof ref === 'string') refs.add(ref);
				} catch {}
			}
		}
	};
	await walk(OUTPUT_DIR);
	return refs;
}

function mapTarget(category) {
	if (!category) return null;
	return CATEGORY_TO_TARGET[category] ?? null;
}

function buildIncompatible(exclude) {
	if (!Array.isArray(exclude) || exclude.length === 0) return [];
	return exclude.filter((s) => typeof s === 'string' && s.length > 0);
}

function generateMdx(enchant, slug, target) {
	const title = enchant.displayName;
	const minCost = enchant.minCost ?? { a: 1, b: 1 };
	const maxCost = enchant.maxCost ?? { a: 1, b: 1 };
	const targetsBlock = target
		? `    targets:\n        - ${target}\n`
		: `    targets: []\n`;
	const incompat = buildIncompatible(enchant.exclude);
	const incompatBlock = incompat.length
		? `    incompatible_with:\n${incompat.map((r) => `        - ${r}`).join('\n')}\n`
		: `    incompatible_with: []\n`;
	return `---
title: ${title}
description: |
    Minecraft ${title} — vanilla 1.21.5 enchantment record (auto-generated).
sidebar:
    label: ${title}
tags:
    - minecraft
    - mc
    - mc-enchant
mc_enchant:
    id: ${enchant.id}
    ref: ${enchant.name}
    slug: ${slug}
    display_name: ${title}
    rarity: common
    max_level: ${enchant.maxLevel ?? 1}
    weight: ${enchant.weight ?? 1}
    treasure: ${Boolean(enchant.treasureOnly)}
    curse: ${Boolean(enchant.curse)}
    tradeable: ${enchant.tradeable !== false}
    discoverable: ${enchant.discoverable !== false}
    available_in_creative: true
${targetsBlock}${incompatBlock}    anvil_cost: 1
    cost:
        a_min: ${minCost.a ?? 0}
        b_min: ${minCost.b ?? 1}
        a_max: ${maxCost.a ?? 0}
        b_max: ${maxCost.b ?? 1}
    tags: []
    description: ''
    data_version: "${VERSION}"
---

import MCEnchantPanel from '@/components/mcdb/MCEnchantPanel.astro';

<MCEnchantPanel data={frontmatter.mc_enchant} />
`;
}

async function main() {
	console.log(`Fetching ${DATA_URL}`);
	const res = await fetch(DATA_URL);
	if (!res.ok) {
		console.error(`upstream HTTP ${res.status}`);
		process.exit(1);
	}
	const enchants = await res.json();
	console.log(`  ${enchants.length} enchants in upstream registry`);

	const existing = await buildExistingRefIndex();
	console.log(`  ${existing.size} MDX pages already exist`);

	await mkdir(OUTPUT_DIR, { recursive: true });

	let created = 0;
	let skippedExisting = 0;
	let skippedNoCategory = 0;
	const unmappedCategories = new Set();
	for (const enchant of enchants) {
		if (!enchant.name) continue;
		if (existing.has(enchant.name)) {
			skippedExisting++;
			continue;
		}
		const target = mapTarget(enchant.category);
		if (!target && enchant.category) {
			unmappedCategories.add(enchant.category);
		}
		const slug = refToSlug(enchant.name);
		const dest = join(OUTPUT_DIR, `${slug}.mdx`);
		if (auditMode) {
			console.log(
				`  [new] ${slug}.mdx  (target=${target ?? '∅'}, upstream=${enchant.category})`,
			);
			created++;
			continue;
		}
		const mdx = generateMdx(enchant, slug, target);
		await writeFile(dest, mdx, 'utf-8');
		created++;
		if (created <= 10 || created % 25 === 0) {
			console.log(
				`  + ${slug}.mdx  (target=${target ?? '∅'})`,
			);
		}
	}

	console.log(`\n✨ Done!`);
	console.log(`  ${auditMode ? 'Would create' : 'Created'}: ${created}`);
	console.log(`  Skipped (already MDX): ${skippedExisting}`);
	if (unmappedCategories.size) {
		console.log(
			`  Unmapped upstream categories (fell back to empty targets): ${[...unmappedCategories].join(', ')}`,
		);
	}
}

main().catch((err) => {
	console.error('❌', err.message);
	process.exit(1);
});
