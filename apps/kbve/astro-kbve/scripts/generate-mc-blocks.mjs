import { mkdir, readdir, readFile, writeFile, stat } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const VERSION = '1.21.5';
const DATA_URL = `https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pc/${VERSION}/blocks.json`;
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, '../src/content/docs/mc/blocks');

const args = process.argv.slice(2);
const auditMode = args.includes('--audit');

function refToSlug(ref) {
	return ref.replace(/_/g, '-');
}

function clamp(n, lo, hi) {
	return Math.max(lo, Math.min(hi, n));
}

function inferMaterialFromRef(ref) {
	if (ref === 'air' || ref === 'cave_air' || ref === 'void_air') return 'air';
	if (/(water|lava|bubble_column)/.test(ref)) return 'liquid';
	if (/(grass_block|dirt|mycelium|podzol|farmland|dirt_path|coarse_dirt|rooted_dirt|mud|moss_block|moss_carpet|pale_moss)/.test(ref)) {
		return 'dirt';
	}
	if (/(red_sand$|^sand$|^soul_sand$|^soul_soil$)/.test(ref)) return 'sand';
	if (ref === 'gravel' || ref === 'suspicious_gravel') return 'gravel';
	if (/(_glass$|_glass_pane$|^glass$|^glass_pane$|^tinted_glass$|^honey_block$|^slime_block$)/.test(ref)) {
		return 'glass';
	}
	if (/^(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_wool$/.test(ref)) {
		return 'wool';
	}
	if (/_carpet$/.test(ref)) return 'wool';
	if (/(_leaves$)/.test(ref)) return 'leaves';
	if (/(_sapling$|_propagule$|_seedling$|^kelp|^seagrass|^tall_seagrass|_flower$|^poppy$|^dandelion$|^blue_orchid$|^allium$|^azure_bluet$|^oxeye_daisy$|^cornflower$|^lily_of_the_valley$|^wither_rose$|^torchflower|^pitcher|^pink_petals$|_bush$|^sweet_berry|^cactus$|^bamboo$|^bamboo_sapling$|^sugar_cane$|^chorus_plant$|^chorus_flower$|^vine$|^twisting_vines|^weeping_vines|^cave_vines|_fungus$|_roots$|_wart_block$|_pickle$|^wheat$|^carrots$|^potatoes$|^beetroots$|^melon_stem$|^pumpkin_stem$|^attached_melon_stem$|^attached_pumpkin_stem$|^big_dripleaf|^small_dripleaf|^spore_blossom$|^fern$|^large_fern$|^grass$|^short_grass$|^tall_grass$|^lily_pad$|^crimson_plant|^warped_plant|^mangrove_propagule$|^firefly_bush$|^leaf_litter$|^bush$|^cactus_flower$)/.test(ref)) {
		return 'plant';
	}
	if (ref === 'ice' || ref === 'packed_ice' || ref === 'blue_ice' || ref === 'frosted_ice') {
		return 'ice';
	}
	if (ref === 'snow' || ref === 'snow_block' || ref === 'powder_snow') return 'snow';
	if (/(redstone_wire|redstone_torch|redstone_wall_torch|repeater|comparator|piston|sticky_piston|observer|hopper|dropper|dispenser|lever|tripwire|target|daylight_detector|note_block|powered_rail|detector_rail|activator_rail|^rail$|redstone_lamp|redstone_block|^moving_piston$|^piston_head$)/.test(ref)) {
		return 'redstone';
	}
	if (/_pressure_plate$|_button$/.test(ref)) return 'redstone';
	if (/(netherrack|nether_quartz|quartz_ore|nether_gold_ore|crimson|warped|soul_fire|soul_torch|soul_lantern|soul_campfire|magma_block|nether_brick|red_nether|nether_wart|^shroomlight$|^basalt$|^smooth_basalt$|^polished_basalt$|^blackstone|^polished_blackstone|^gilded_blackstone$|^ancient_debris$|^crying_obsidian$)/.test(ref)) {
		return 'nether';
	}
	if (/(end_stone|end_portal|end_rod|end_gateway|^chorus|^purpur|^dragon_egg$|^endermite)/.test(ref)) {
		return 'end';
	}
	if (/(iron_block|gold_block|diamond_block|emerald_block|netherite_block|copper_block|raw_iron_block|raw_gold_block|raw_copper_block|chain$|anvil$|chipped_anvil$|damaged_anvil$|iron_bars$|iron_door$|iron_trapdoor$|cauldron$|water_cauldron$|lava_cauldron$|powder_snow_cauldron$|^heavy_core$|hopper$|brewing_stand$|bell$|copper_door$|copper_trapdoor$|copper_grate$|copper_bulb$|tuff_door$|tuff_trapdoor$|exposed_copper|weathered_copper|oxidized_copper|waxed_copper)/.test(ref)) {
		return 'metal';
	}
	if (/^(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|bamboo|crimson|warped|pale_oak)_(log|wood|planks|stem|hyphae|stripped|fence|gate|door|trapdoor|stairs|slab|sign|hanging_sign|button|pressure_plate|sapling)/.test(ref)) {
		return 'wood';
	}
	if (/(stripped_.*_(log|wood|stem|hyphae)$|.*_planks$|.*_log$|.*_wood$|.*_stem$|.*_hyphae$|bamboo_block$|bamboo_mosaic|.*_fence_gate$|.*_fence$)/.test(ref)) {
		return 'wood';
	}
	return null;
}

function mapMaterial(ref, upstream) {
	const byRef = inferMaterialFromRef(ref);
	if (byRef) return byRef;
	if (!upstream) return 'misc';
	if (upstream === 'air' || ref === 'air') return 'air';
	if (upstream === 'wool') return 'wool';
	if (upstream === 'coweb' || upstream === 'sword_instantly_mines') return 'misc';
	if (upstream === 'default' || upstream === 'incorrect_for_wooden_tool') {
		return 'stone';
	}
	const parts = upstream.split(';');
	if (parts.includes('leaves')) return 'leaves';
	if (parts.includes('plant') || parts.includes('gourd') || parts.includes('vine_or_glow_lichen')) {
		return 'plant';
	}
	if (parts.includes('mineable/pickaxe')) return 'stone';
	if (parts.includes('mineable/axe')) return 'wood';
	if (parts.includes('mineable/shovel')) return 'dirt';
	if (parts.includes('mineable/hoe')) return 'plant';
	return 'misc';
}

function inferBestTool(ref, upstream, material) {
	if (!upstream) {
		if (material === 'wood') return 'axe';
		if (material === 'dirt' || material === 'sand' || material === 'gravel' || material === 'snow') {
			return 'shovel';
		}
		if (material === 'wool') return 'shears';
		if (material === 'leaves') return 'shears';
		return 'hand';
	}
	if (upstream.includes('mineable/pickaxe')) return 'pickaxe';
	if (upstream.includes('mineable/axe')) return 'axe';
	if (upstream.includes('mineable/shovel')) return 'shovel';
	if (upstream.includes('mineable/hoe')) return 'hoe';
	if (upstream === 'wool') return 'shears';
	if (upstream === 'coweb') return 'shears';
	if (upstream === 'sword_instantly_mines') return 'sword';
	return 'hand';
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
					const ref = fm?.mc_block?.ref;
					if (typeof ref === 'string') refs.add(ref);
				} catch {}
			}
		}
	};
	await walk(OUTPUT_DIR);
	return refs;
}

function titleCase(name) {
	return name
		.split(' ')
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}

function generateMdx(block, slug, material, bestTool) {
	const title = block.displayName ?? titleCase(block.name.replace(/_/g, ' '));
	const hardness = typeof block.hardness === 'number' ? block.hardness : 0;
	const blastResistance = typeof block.resistance === 'number' && block.resistance >= 0
		? block.resistance
		: 0;
	const lightEmission = clamp(
		typeof block.emitLight === 'number' ? block.emitLight : 0,
		0,
		15,
	);
	const lightOpacity = clamp(
		typeof block.filterLight === 'number' ? block.filterLight : 15,
		0,
		15,
	);
	const transparent = Boolean(block.transparent);
	const diggable = block.diggable !== false && hardness !== -1;
	return `---
title: ${title}
description: |
    Minecraft ${title} — vanilla 1.21.5 block record (auto-generated).
sidebar:
    label: ${title}
tags:
    - minecraft
    - mc
    - mc-block
mc_block:
    id: ${block.id}
    ref: ${block.name}
    slug: ${slug}
    display_name: ${title}
    material: ${material}
    hardness: ${hardness}
    blast_resistance: ${blastResistance}
    best_tool: ${bestTool}
    required_tool_tier: 0
    light_emission: ${lightEmission}
    light_opacity: ${lightOpacity}
    transparent: ${transparent}
    placeable: true
    solid: true
    renewable: false
    diggable: ${diggable}
    drops: []
    tags: []
    data_version: "${VERSION}"
---

import MCBlockPanel from '@/components/mcdb/MCBlockPanel.astro';

<MCBlockPanel data={frontmatter.mc_block} />
`;
}

async function main() {
	console.log(`Fetching ${DATA_URL}`);
	const res = await fetch(DATA_URL);
	if (!res.ok) {
		console.error(`upstream HTTP ${res.status}`);
		process.exit(1);
	}
	const blocks = await res.json();
	console.log(`  ${blocks.length} blocks in upstream registry`);

	const existing = await buildExistingRefIndex();
	console.log(`  ${existing.size} MDX pages already exist`);

	await mkdir(OUTPUT_DIR, { recursive: true });

	let created = 0;
	let skippedExisting = 0;
	for (const block of blocks) {
		if (!block.name) continue;
		if (existing.has(block.name)) {
			skippedExisting++;
			continue;
		}
		const slug = refToSlug(block.name);
		const material = mapMaterial(block.name, block.material);
		const bestTool = inferBestTool(block.name, block.material, material);
		const dest = join(OUTPUT_DIR, `${slug}.mdx`);
		if (auditMode) {
			console.log(
				`  [new] ${slug}.mdx  (material=${material}, tool=${bestTool}, upstream=${block.material ?? '∅'})`,
			);
			created++;
			continue;
		}
		const mdx = generateMdx(block, slug, material, bestTool);
		await writeFile(dest, mdx, 'utf-8');
		created++;
		if (created <= 10 || created % 100 === 0) {
			console.log(`  + ${slug}.mdx  (material=${material}, tool=${bestTool})`);
		}
	}

	console.log(`\n✨ Done!`);
	console.log(`  ${auditMode ? 'Would create' : 'Created'}: ${created}`);
	console.log(`  Skipped (already MDX): ${skippedExisting}`);
}

main().catch((err) => {
	console.error('❌', err.message);
	process.exit(1);
});
