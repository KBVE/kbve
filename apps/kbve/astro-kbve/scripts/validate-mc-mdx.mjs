/**
 * Local validator: parse every MDX file under content/docs/mc/{enchants,blocks}
 * and validate frontmatter against a self-contained Zod mirror of the
 * proto-aligned schemas. Used to verify generator output without the
 * full astro/nx build (which mis-resolves paths across git worktrees).
 *
 * Run: node scripts/validate-mc-mdx.mjs
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const MCEnchantRarities = ['common', 'uncommon', 'rare', 'very_rare'];
const MCEnchantTargets = [
	'armor',
	'armor_head',
	'armor_chest',
	'armor_legs',
	'armor_feet',
	'weapon',
	'digger',
	'fishing_rod',
	'trident',
	'crossbow',
	'bow',
	'wearable',
	'breakable',
	'vanishable',
	'mace',
];
const McBlockTools = ['hand', 'pickaxe', 'axe', 'shovel', 'hoe', 'shears', 'sword'];
const McBlockMaterials = [
	'air',
	'stone',
	'wood',
	'dirt',
	'sand',
	'gravel',
	'metal',
	'glass',
	'wool',
	'plant',
	'leaves',
	'ice',
	'snow',
	'liquid',
	'redstone',
	'nether',
	'end',
	'misc',
];

const refRe = /^(?:[a-z]+:)?[a-z0-9_]+(?:\/[a-z0-9_]+)*$/;
const slugRe = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;
const Identity = z.object({
	id: z.number().int().nonnegative(),
	ref: z.string().min(1).regex(refRe),
	slug: z.string().min(1).regex(slugRe),
});

const McEnchant = Identity.extend({
	display_name: z.string().min(1),
	rarity: z.enum(MCEnchantRarities),
	max_level: z.number().int().min(1).max(10),
	weight: z.number().int().positive(),
	treasure: z.boolean().default(false),
	curse: z.boolean().default(false),
	tradeable: z.boolean().default(true),
	discoverable: z.boolean().default(true),
	available_in_creative: z.boolean().default(true),
	targets: z.array(z.enum(MCEnchantTargets)).default([]),
	incompatible_with: z.array(z.string().min(1)).default([]),
	anvil_cost: z.number().int().nonnegative().default(1),
	cost: z
		.object({
			a_min: z.number().int(),
			b_min: z.number().int(),
			a_max: z.number().int(),
			b_max: z.number().int(),
		})
		.optional(),
	tags: z.array(z.string().min(1)).default([]),
	description: z.string().default(''),
	data_version: z.string().default(''),
});

const McBlockDrop = z.object({
	ref: z.string().min(1),
	qty_min: z.number().int().nonnegative().default(1),
	qty_max: z.number().int().positive().default(1),
	silk_touch_only: z.boolean().default(false),
	affected_by_fortune: z.boolean().default(false),
});

const McBlock = Identity.extend({
	display_name: z.string().min(1),
	material: z.enum(McBlockMaterials),
	hardness: z.number(),
	blast_resistance: z.number().nonnegative(),
	best_tool: z.enum(McBlockTools).default('hand'),
	required_tool_tier: z.number().int().min(0).max(6).default(0),
	light_emission: z.number().int().min(0).max(15).default(0),
	light_opacity: z.number().int().min(0).max(15).default(15),
	transparent: z.boolean().default(false),
	placeable: z.boolean().default(true),
	solid: z.boolean().default(true),
	renewable: z.boolean().default(false),
	diggable: z.boolean().default(true),
	drops: z.array(McBlockDrop).default([]),
	tags: z.array(z.string().min(1)).default([]),
	data_version: z.string().default(''),
});

const TARGETS = [
	{ dir: 'src/content/docs/mc/enchants', key: 'mc_enchant', schema: McEnchant },
	{ dir: 'src/content/docs/mc/blocks', key: 'mc_block', schema: McBlock },
];

async function* walk(dir) {
	for (const name of await readdir(dir)) {
		const full = join(dir, name);
		const s = await stat(full);
		if (s.isDirectory()) yield* walk(full);
		else if (name.endsWith('.mdx')) yield full;
	}
}

let total = 0;
let failed = 0;
for (const { dir, key, schema } of TARGETS) {
	const absDir = join(ROOT, dir);
	for await (const file of walk(absDir)) {
		total++;
		const txt = await readFile(file, 'utf-8');
		const m = txt.match(/^---\n([\s\S]*?)\n---/);
		if (!m) {
			console.error(`${file}: no frontmatter`);
			failed++;
			continue;
		}
		const fm = parseYaml(m[1]);
		const data = fm?.[key];
		if (!data) {
			console.error(`${file}: missing ${key}`);
			failed++;
			continue;
		}
		const result = schema.safeParse(data);
		if (!result.success) {
			console.error(`${file}:`);
			for (const issue of result.error.issues) {
				console.error(`  ${issue.path.join('.')}: ${issue.message}`);
			}
			failed++;
		}
	}
}

console.log(`\n${total - failed} / ${total} files validate cleanly`);
if (failed > 0) process.exit(1);
