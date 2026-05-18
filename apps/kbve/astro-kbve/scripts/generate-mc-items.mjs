import { mkdir, readdir, readFile, writeFile, stat } from 'fs/promises';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

const VERSION = '1.21.5';
const DATA_URL = `https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pc/${VERSION}/items.json`;
const OUTPUT_DIR = './src/content/docs/mc/items';
const TEXTURES_DIR = './public/mc/textures';

const args = process.argv.slice(2);
const auditMode = args.includes('--audit');

const TIER_PREFIXES = ['wooden', 'stone', 'iron', 'golden', 'diamond', 'netherite', 'leather', 'chainmail', 'turtle'];

function refToSlug(ref) {
	return ref.replace(/_/g, '-');
}

function inferTier(ref) {
	for (const tier of TIER_PREFIXES) {
		if (ref.startsWith(`${tier}_`)) return tier;
	}
	return null;
}

function inferCategory(ref) {
	if (/_(sword|bow|crossbow|trident)$/.test(ref) || ref === 'mace' || ref === 'arrow' || ref.endsWith('_arrow')) {
		return 'weapon';
	}
	if (/_(pickaxe|axe|shovel|hoe|shears)$/.test(ref)) return 'tool';
	if (/_(helmet|chestplate|leggings|boots)$/.test(ref) || ref === 'turtle_helmet' || ref === 'elytra' || ref.endsWith('_horse_armor')) {
		return 'armor';
	}
	if (/(beef|porkchop|chicken|mutton|rabbit|cod|salmon|bread|cookie|apple|carrot|potato|melon_slice|berries|stew|pie|cake|honey_bottle)/.test(ref) || ref === 'rotten_flesh' || ref === 'spider_eye') {
		return 'food';
	}
	if (/_spawn_egg$/.test(ref)) return 'spawn_egg';
	if (/^music_disc_/.test(ref)) return 'music';
	if (/^(potion|splash_potion|lingering_potion|tipped_arrow|glass_bottle|brewing_stand|blaze_powder|nether_wart|fermented_spider_eye|ghast_tear|magma_cream|sugar|glistering_melon_slice|golden_carrot|rabbit_foot|pufferfish|dragon_breath|phantom_membrane)$/.test(ref)) {
		return 'brewing';
	}
	if (/^(redstone|repeater|comparator|piston|sticky_piston|observer|hopper|dropper|dispenser|lever|button|tripwire|target|daylight_detector|note_block|powered_rail|detector_rail|activator_rail|rail)$/.test(ref) || ref.endsWith('_pressure_plate') || ref.startsWith('redstone_')) {
		return 'redstone';
	}
	if (/(boat|raft|minecart|saddle|elytra)/.test(ref)) return 'transport';
	if (/_banner$/.test(ref) || /_banner_pattern$/.test(ref)) return 'banner';
	if (/^(map|filled_map)$/.test(ref)) return 'map';
	if (/_(door|trapdoor|fence|gate|stairs|slab|wall|sign|hanging_sign|carpet|button)$/.test(ref) || /(painting|frame|flower|seedling|sapling|leaves|wool|terracotta|glazed|concrete|candle|torch|lantern|lamp|head|skull|pumpkin|jack_o_lantern|sea_pickle|coral)/.test(ref)) {
		return 'decoration';
	}
	if (/(ingot|nugget|gem|dust|powder|stick|string|leather|paper|book|bone|gunpowder|slime_ball|magma_cream|blaze_rod|ender_pearl|eye_of_ender|ghast_tear|emerald|diamond|netherite_scrap|iron_nugget|gold_nugget|quartz|prismarine_shard|prismarine_crystals|nautilus_shell|heart_of_the_sea|echo_shard|disc_fragment_5|recovery_compass|compass|clock|spyglass|brush|bundle)/.test(ref)) {
		return 'material';
	}
	if (/(_log|_planks|_wood|stone|cobblestone|deepslate|dirt|gravel|sand|sandstone|terracotta|wool|glass|brick|prismarine|nether|end_stone|obsidian|tuff|calcite|amethyst|copper|netherrack|magma_block|ice|snow|clay|honey|honeycomb|moss|mycelium|grass_block|farmland|mud|crimson|warped)/.test(ref) && !ref.includes('sword') && !ref.includes('axe') && !ref.includes('pickaxe') && !ref.includes('shovel') && !ref.includes('hoe')) {
		return 'block';
	}
	return 'misc';
}

function inferStackSize(item) {
	if (typeof item.stackSize === 'number') return item.stackSize;
	return 64;
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
					const ref = fm?.mc_item?.ref;
					if (typeof ref === 'string') refs.add(ref);
				} catch {}
			}
		}
	};
	await walk(OUTPUT_DIR);
	return refs;
}

async function hasTexture(ref) {
	const itemPath = join(TEXTURES_DIR, 'item', `${ref}.png`);
	const blockPath = join(TEXTURES_DIR, 'block', `${ref}.png`);
	return (await exists(itemPath)) || (await exists(blockPath));
}

function titleCase(name) {
	return name
		.split(' ')
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}

function generateMdx(item, slug, category, tier) {
	const title = item.displayName ?? titleCase(item.name.replace(/_/g, ' '));
	const stackSize = inferStackSize(item);
	const tierLine = tier ? `\n    tier: ${tier}` : '';
	return `---
title: ${title}
description: |
    Minecraft ${title} — vanilla 1.21.5 item record (auto-generated).
sidebar:
    label: ${title}
tags:
    - minecraft
    - mc
    - mc-item
mc_item:
    id: ${item.id}
    ref: ${item.name}
    slug: ${slug}
    display_name: ${title}
    category: ${category}
    rarity: common
    stack_size: ${stackSize}${tierLine}
    tags: []
    data_version: "${VERSION}"
---

import MCItemPanel from '@/components/mcdb/MCItemPanel.astro';

<MCItemPanel data={frontmatter.mc_item} />
`;
}

async function main() {
	console.log(`Fetching ${DATA_URL}`);
	const res = await fetch(DATA_URL);
	if (!res.ok) {
		console.error(`upstream HTTP ${res.status}`);
		process.exit(1);
	}
	const items = await res.json();
	console.log(`  ${items.length} items in upstream registry`);

	const existing = await buildExistingRefIndex();
	console.log(`  ${existing.size} MDX pages already exist`);

	await mkdir(OUTPUT_DIR, { recursive: true });

	let created = 0;
	let skippedExisting = 0;
	let skippedNoTexture = 0;
	for (const item of items) {
		if (!item.name) continue;
		if (existing.has(item.name)) {
			skippedExisting++;
			continue;
		}
		if (!(await hasTexture(item.name))) {
			skippedNoTexture++;
			continue;
		}
		const slug = refToSlug(item.name);
		const category = inferCategory(item.name);
		const tier = inferTier(item.name);
		const dest = join(OUTPUT_DIR, `${slug}.mdx`);
		if (auditMode) {
			console.log(`  [new] ${slug}.mdx  (${category}${tier ? `, ${tier}` : ''})`);
			created++;
			continue;
		}
		const mdx = generateMdx(item, slug, category, tier);
		await writeFile(dest, mdx, 'utf-8');
		created++;
		if (created <= 10 || created % 100 === 0) {
			console.log(`  + ${slug}.mdx  (${category}${tier ? `, ${tier}` : ''})`);
		}
	}

	console.log(`\n✨ Done!`);
	console.log(`  ${auditMode ? 'Would create' : 'Created'}: ${created}`);
	console.log(`  Skipped (already MDX): ${skippedExisting}`);
	console.log(`  Skipped (no texture):  ${skippedNoTexture}`);
}

main().catch((err) => {
	console.error('❌', err.message);
	process.exit(1);
});
