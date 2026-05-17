/**
 * Phase 5.3-C: secondary enrichment pass for vanilla MC item MDX.
 *
 * Reads every existing apps/kbve/astro-kbve/src/content/docs/mc/items/*.mdx,
 * parses the frontmatter, and for each item fills in stat blocks from the
 * PrismarineJS/minecraft-data upstream registry + a hand-coded constant
 * table for damage / armor / durability — but ONLY for fields explicitly
 * listed in the allow-set below, and ONLY when the current value is missing
 * or empty. Already-populated fields (hand-curated diamond tier, etc.) are
 * left untouched.
 *
 * Allow-set:
 *   - max_durability        (only if 0 / missing)
 *   - damage block          (only if missing entirely)
 *   - mining block          (only if missing AND ref ends in pickaxe/axe/shovel/hoe)
 *   - equipment block       (only if missing AND ref ends in helmet/chestplate/leggings/boots)
 *   - food block            (only if missing AND ref appears in foods.json)
 *   - enchants block        (only if missing) — small static table by category
 *
 * Run:
 *   node scripts/enrich-mc-items.mjs --audit   dry-run, prints planned changes
 *   node scripts/enrich-mc-items.mjs           write changes
 */

import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

const VERSION = '1.21.5';
const ITEMS_URL = `https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pc/${VERSION}/items.json`;
const FOODS_URL = `https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pc/${VERSION}/foods.json`;
const OUTPUT_DIR = './src/content/docs/mc/items';

const args = process.argv.slice(2);
const auditMode = args.includes('--audit');

// ---------------------------------------------------------------------------
// Hand-coded vanilla stat tables (1.21.5)
// ---------------------------------------------------------------------------

// max_durability — index = tier
const TOOL_DURABILITY = {
	wooden: 59,
	stone: 131,
	golden: 32,
	iron: 250,
	diamond: 1561,
	netherite: 2031,
};

const ARMOR_DURABILITY = {
	helmet:     { leather: 55, chainmail: 165, iron: 165, golden: 77, diamond: 363, netherite: 407, turtle: 275 },
	chestplate: { leather: 80, chainmail: 240, iron: 240, golden: 112, diamond: 528, netherite: 592 },
	leggings:   { leather: 75, chainmail: 225, iron: 225, golden: 105, diamond: 495, netherite: 555 },
	boots:      { leather: 65, chainmail: 195, iron: 195, golden: 91,  diamond: 429, netherite: 481 },
};

// Sword: attack_damage by tier, attack_speed 1.6 across
const SWORD_DAMAGE = {
	wooden: 4, stone: 5, iron: 6, golden: 4, diamond: 7, netherite: 8,
};

// Axe: per-tier damage + speed
const AXE_DAMAGE = {
	wooden:    { damage: 7,  speed: 0.8 },
	stone:     { damage: 9,  speed: 0.9 },
	iron:      { damage: 9,  speed: 0.9 },
	golden:    { damage: 7,  speed: 1.0 },
	diamond:   { damage: 9,  speed: 1.0 },
	netherite: { damage: 10, speed: 1.0 },
};

// Pickaxe: attack_damage by tier, attack_speed 1.2 across
const PICKAXE_DAMAGE = {
	wooden: 2, stone: 3, iron: 4, golden: 2, diamond: 5, netherite: 6,
};

// Shovel: pickaxe + 0.5 (matches existing diamond-shovel.mdx hand-curated value), speed 1.0
const SHOVEL_DAMAGE = {
	wooden:    { damage: 2.5, speed: 1.0 },
	stone:     { damage: 3.5, speed: 1.0 },
	iron:      { damage: 4.5, speed: 1.0 },
	golden:    { damage: 2.5, speed: 1.0 },
	diamond:   { damage: 5.5, speed: 1.0 },
	netherite: { damage: 6.5, speed: 1.0 },
};

// Hoe: damage 1, speed varies (gold/wooden 1.0, stone 2.0, iron 3.0, diamond/netherite 4.0)
const HOE_DAMAGE = {
	wooden:    { damage: 1, speed: 1.0 },
	stone:     { damage: 1, speed: 2.0 },
	iron:      { damage: 1, speed: 3.0 },
	golden:    { damage: 1, speed: 1.0 },
	diamond:   { damage: 1, speed: 4.0 },
	netherite: { damage: 1, speed: 4.0 },
};

// Mining tier: 1..5 (netherite). schema bound is 1..6.
const MINING_TIER = {
	wooden:    1,
	golden:    1,
	stone:     2,
	iron:      3,
	diamond:   4,
	netherite: 5,
};

// Armor points + toughness + knockback_resistance per slot/tier
// Source: minecraft.wiki/w/Armor (1.21.5 vanilla values)
const ARMOR_STATS = {
	helmet: {
		leather:   { armor_points: 1, toughness: 0, knockback_resistance: 0 },
		chainmail: { armor_points: 2, toughness: 0, knockback_resistance: 0 },
		iron:      { armor_points: 2, toughness: 0, knockback_resistance: 0 },
		golden:    { armor_points: 2, toughness: 0, knockback_resistance: 0 },
		diamond:   { armor_points: 3, toughness: 2, knockback_resistance: 0 },
		netherite: { armor_points: 3, toughness: 3, knockback_resistance: 0 },
		turtle:    { armor_points: 2, toughness: 0, knockback_resistance: 0 },
	},
	chestplate: {
		leather:   { armor_points: 3, toughness: 0, knockback_resistance: 0 },
		chainmail: { armor_points: 5, toughness: 0, knockback_resistance: 0 },
		iron:      { armor_points: 6, toughness: 0, knockback_resistance: 0 },
		golden:    { armor_points: 5, toughness: 0, knockback_resistance: 0 },
		diamond:   { armor_points: 8, toughness: 2, knockback_resistance: 0 },
		netherite: { armor_points: 8, toughness: 3, knockback_resistance: 0 },
	},
	leggings: {
		leather:   { armor_points: 2, toughness: 0, knockback_resistance: 0 },
		chainmail: { armor_points: 4, toughness: 0, knockback_resistance: 0 },
		iron:      { armor_points: 5, toughness: 0, knockback_resistance: 0 },
		golden:    { armor_points: 3, toughness: 0, knockback_resistance: 0 },
		diamond:   { armor_points: 6, toughness: 2, knockback_resistance: 0 },
		netherite: { armor_points: 6, toughness: 3, knockback_resistance: 0 },
	},
	boots: {
		leather:   { armor_points: 1, toughness: 0, knockback_resistance: 0 },
		chainmail: { armor_points: 1, toughness: 0, knockback_resistance: 0 },
		iron:      { armor_points: 2, toughness: 0, knockback_resistance: 0 },
		golden:    { armor_points: 1, toughness: 0, knockback_resistance: 0 },
		diamond:   { armor_points: 3, toughness: 2, knockback_resistance: 0 },
		netherite: { armor_points: 3, toughness: 3, knockback_resistance: 0 },
	},
};

// Enchant allow-lists by category (mirrors the hand-curated diamond tier MDX
// pages — sword/pickaxe/axe/shovel/hoe/helmet/chestplate/leggings/boots/bow/
// crossbow/trident/mace).
const ENCHANTS_SWORD = [
	'sharpness', 'smite', 'bane_of_arthropods', 'knockback', 'fire_aspect',
	'looting', 'sweeping_edge', 'unbreaking', 'mending', 'vanishing_curse',
];
const ENCHANTS_PICKAXE = [
	'efficiency', 'fortune', 'silk_touch', 'unbreaking', 'mending', 'vanishing_curse',
];
const ENCHANTS_AXE = [
	'efficiency', 'fortune', 'silk_touch', 'sharpness', 'smite',
	'bane_of_arthropods', 'unbreaking', 'mending', 'vanishing_curse',
];
const ENCHANTS_SHOVEL = ENCHANTS_PICKAXE;
const ENCHANTS_HOE = ENCHANTS_PICKAXE;
const ENCHANTS_HELMET = [
	'aqua_affinity', 'blast_protection', 'fire_protection',
	'projectile_protection', 'protection', 'respiration', 'thorns',
	'unbreaking', 'mending', 'binding_curse', 'vanishing_curse',
];
const ENCHANTS_CHESTPLATE = [
	'blast_protection', 'fire_protection', 'projectile_protection',
	'protection', 'thorns', 'unbreaking', 'mending', 'binding_curse',
	'vanishing_curse',
];
const ENCHANTS_LEGGINGS = [
	'blast_protection', 'fire_protection', 'projectile_protection',
	'protection', 'swift_sneak', 'thorns', 'unbreaking', 'mending',
	'binding_curse', 'vanishing_curse',
];
const ENCHANTS_BOOTS = [
	'blast_protection', 'depth_strider', 'feather_falling', 'fire_protection',
	'frost_walker', 'projectile_protection', 'protection', 'soul_speed',
	'thorns', 'unbreaking', 'mending', 'binding_curse', 'vanishing_curse',
];
const ENCHANTS_BOW = [
	'flame', 'infinity', 'power', 'punch', 'unbreaking', 'mending', 'vanishing_curse',
];
const ENCHANTS_CROSSBOW = [
	'multishot', 'piercing', 'quick_charge', 'unbreaking', 'mending', 'vanishing_curse',
];
const ENCHANTS_TRIDENT = [
	'channeling', 'impaling', 'loyalty', 'riptide', 'unbreaking', 'mending', 'vanishing_curse',
];
const ENCHANTS_MACE = [
	'density', 'breach', 'wind_burst', 'fire_aspect', 'smite',
	'bane_of_arthropods', 'unbreaking', 'mending', 'vanishing_curse',
];
const ENCHANTS_FISHING_ROD = [
	'lure', 'luck_of_the_sea', 'unbreaking', 'mending', 'vanishing_curse',
];
const ENCHANTS_SHEARS = ['efficiency', 'unbreaking', 'mending', 'vanishing_curse'];

// ---------------------------------------------------------------------------
// Inference helpers
// ---------------------------------------------------------------------------

const TIERS_FROM_REF = ['netherite', 'diamond', 'golden', 'iron', 'stone', 'wooden', 'leather', 'chainmail', 'turtle'];

function tierFromRef(ref) {
	for (const t of TIERS_FROM_REF) {
		if (ref.startsWith(`${t}_`)) return t;
	}
	return null;
}

function toolFromRef(ref) {
	if (ref.endsWith('_pickaxe')) return 'pickaxe';
	if (ref.endsWith('_axe')) return 'axe';
	if (ref.endsWith('_shovel')) return 'shovel';
	if (ref.endsWith('_hoe')) return 'hoe';
	if (ref.endsWith('_sword')) return 'sword';
	if (ref === 'shears') return 'shears';
	return null;
}

function armorSlotFromRef(ref) {
	if (ref.endsWith('_helmet') || ref === 'turtle_helmet') return 'helmet';
	if (ref.endsWith('_chestplate')) return 'chestplate';
	if (ref.endsWith('_leggings')) return 'leggings';
	if (ref.endsWith('_boots')) return 'boots';
	return null;
}

function equipmentSlotForArmor(slot) {
	if (slot === 'helmet') return 'head';
	if (slot === 'chestplate') return 'chest';
	if (slot === 'leggings') return 'legs';
	if (slot === 'boots') return 'feet';
	return null;
}

function isToolDurable(ref) {
	const t = toolFromRef(ref);
	return t === 'pickaxe' || t === 'axe' || t === 'shovel' || t === 'hoe' || t === 'sword';
}

function enchantsForRef(ref) {
	const tool = toolFromRef(ref);
	if (tool === 'sword') return ENCHANTS_SWORD;
	if (tool === 'pickaxe') return ENCHANTS_PICKAXE;
	if (tool === 'axe') return ENCHANTS_AXE;
	if (tool === 'shovel') return ENCHANTS_SHOVEL;
	if (tool === 'hoe') return ENCHANTS_HOE;
	if (tool === 'shears') return ENCHANTS_SHEARS;
	const armor = armorSlotFromRef(ref);
	if (armor === 'helmet') return ENCHANTS_HELMET;
	if (armor === 'chestplate') return ENCHANTS_CHESTPLATE;
	if (armor === 'leggings') return ENCHANTS_LEGGINGS;
	if (armor === 'boots') return ENCHANTS_BOOTS;
	if (ref === 'bow') return ENCHANTS_BOW;
	if (ref === 'crossbow') return ENCHANTS_CROSSBOW;
	if (ref === 'trident') return ENCHANTS_TRIDENT;
	if (ref === 'mace') return ENCHANTS_MACE;
	if (ref === 'fishing_rod') return ENCHANTS_FISHING_ROD;
	return null;
}

// ---------------------------------------------------------------------------
// Stat lookups
// ---------------------------------------------------------------------------

function lookupMaxDurability(ref) {
	const tier = tierFromRef(ref);
	if (!tier) return null;

	const armorSlot = armorSlotFromRef(ref);
	if (armorSlot) {
		const tbl = ARMOR_DURABILITY[armorSlot];
		const v = tbl?.[tier];
		return typeof v === 'number' ? v : null;
	}

	if (isToolDurable(ref)) {
		const v = TOOL_DURABILITY[tier];
		return typeof v === 'number' ? v : null;
	}
	return null;
}

function lookupDamage(ref) {
	const tier = tierFromRef(ref);
	if (!tier) return null;
	const tool = toolFromRef(ref);
	if (tool === 'sword') {
		const d = SWORD_DAMAGE[tier];
		if (typeof d !== 'number') return null;
		return { attack_damage: d, attack_speed: 1.6 };
	}
	if (tool === 'axe') {
		const v = AXE_DAMAGE[tier];
		return v ? { attack_damage: v.damage, attack_speed: v.speed } : null;
	}
	if (tool === 'pickaxe') {
		const d = PICKAXE_DAMAGE[tier];
		if (typeof d !== 'number') return null;
		return { attack_damage: d, attack_speed: 1.2 };
	}
	if (tool === 'shovel') {
		const v = SHOVEL_DAMAGE[tier];
		return v ? { attack_damage: v.damage, attack_speed: v.speed } : null;
	}
	if (tool === 'hoe') {
		const v = HOE_DAMAGE[tier];
		return v ? { attack_damage: v.damage, attack_speed: v.speed } : null;
	}
	return null;
}

function lookupMining(ref) {
	const tool = toolFromRef(ref);
	if (tool !== 'pickaxe' && tool !== 'axe' && tool !== 'shovel' && tool !== 'hoe') return null;
	const tier = tierFromRef(ref);
	if (!tier) return null;
	const t = MINING_TIER[tier];
	if (typeof t !== 'number') return null;
	return { tool_type: tool, tier: t };
}

function lookupEquipment(ref) {
	const slot = armorSlotFromRef(ref);
	if (!slot) return null;
	let tier;
	if (ref === 'turtle_helmet') tier = 'turtle';
	else tier = tierFromRef(ref);
	if (!tier) return null;
	const slotTable = ARMOR_STATS[slot];
	const stats = slotTable?.[tier];
	if (!stats) return null;
	const equipSlot = equipmentSlotForArmor(slot);
	if (!equipSlot) return null;
	return {
		slot: equipSlot,
		armor_points: stats.armor_points,
		toughness: stats.toughness,
		knockback_resistance: stats.knockback_resistance,
	};
}

function lookupFood(ref, foodsByRef) {
	const f = foodsByRef.get(ref);
	if (!f) return null;
	const nutrition = Math.round(f.foodPoints ?? 0);
	const saturation = typeof f.saturation === 'number' ? f.saturation : 0;
	return { nutrition, saturation };
}

// ---------------------------------------------------------------------------
// MDX parsing / surgical injection
// ---------------------------------------------------------------------------

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const MC_ITEM_BLOCK_RE = /^(mc_item:\s*\n)((?:    [^\n]*\n?)+)/m;

function parseFrontmatter(content) {
	const m = content.match(FRONTMATTER_RE);
	if (!m) return null;
	let fm;
	try { fm = parseYaml(m[1]); } catch { return null; }
	return { frontmatter: fm, raw: content };
}

/**
 * Format a small structured object as 4-space-indented YAML lines that fit
 * under `mc_item:`. Hand-rolled to keep the existing MDX formatting (no
 * roundtrip noise from the yaml library). Only handles the shapes we emit.
 */
function formatYamlBlock(key, value, baseIndent = '    ') {
	const lines = [];
	const child = baseIndent + '    ';
	if (Array.isArray(value)) {
		lines.push(`${baseIndent}${key}:`);
		for (const item of value) {
			lines.push(`${baseIndent}    - ${item}`);
		}
		return lines;
	}
	if (value && typeof value === 'object') {
		lines.push(`${baseIndent}${key}:`);
		for (const [k, v] of Object.entries(value)) {
			if (v && typeof v === 'object' && !Array.isArray(v)) {
				lines.push(...formatYamlBlock(k, v, child));
			} else if (Array.isArray(v)) {
				lines.push(`${child}${k}:`);
				for (const item of v) lines.push(`${child}    - ${item}`);
			} else {
				lines.push(`${child}${k}: ${formatScalar(v)}`);
			}
		}
		return lines;
	}
	lines.push(`${baseIndent}${key}: ${formatScalar(value)}`);
	return lines;
}

function formatScalar(v) {
	if (typeof v === 'string') return v;
	return String(v);
}

/**
 * Inject new YAML lines into the mc_item: block of a frontmatter string.
 * `insertions` is an array of objects describing where to put each block.
 *   { lines: string[], beforeKey?: string, afterKey?: string }
 * If beforeKey matches a `    <key>:` line in mc_item, insert above it.
 * Otherwise append to end of mc_item block (before next top-level key or
 * end of frontmatter).
 */
function injectIntoMcItem(rawMdx, insertions) {
	const m = rawMdx.match(FRONTMATTER_RE);
	if (!m) return null;
	const fmBlock = m[1];
	const body = m[2];

	// Split the frontmatter into lines and find the mc_item: section bounds.
	const lines = fmBlock.split('\n');
	let mcItemStart = -1;
	let mcItemEnd = lines.length; // exclusive
	for (let i = 0; i < lines.length; i++) {
		if (mcItemStart === -1) {
			if (/^mc_item:\s*$/.test(lines[i])) mcItemStart = i + 1;
		} else {
			// mc_item ends at next top-level key (non-indented, non-blank starting with letter)
			if (/^[A-Za-z]/.test(lines[i]) && !lines[i].startsWith(' ')) {
				mcItemEnd = i;
				break;
			}
		}
	}
	if (mcItemStart === -1) return null;

	// Find each insertion's target line index within mc_item block.
	// We process inserts in order; each insert grabs its index against the
	// current array, which may have grown from previous inserts.
	let working = lines.slice();
	const shift = (target, count) => {
		if (target <= mcItemStart) return;
		// adjust mcItemEnd accordingly
		mcItemEnd += count;
	};

	const findInBlock = (key) => {
		const re = new RegExp(`^    ${key}:`);
		for (let i = mcItemStart; i < mcItemEnd; i++) {
			if (re.test(working[i])) return i;
		}
		return -1;
	};

	for (const ins of insertions) {
		let insertAt = -1;
		if (ins.beforeKey) {
			insertAt = findInBlock(ins.beforeKey);
			if (insertAt === -1 && ins.fallbackBeforeKey) {
				for (const fk of ins.fallbackBeforeKey) {
					insertAt = findInBlock(fk);
					if (insertAt !== -1) break;
				}
			}
		}
		if (insertAt === -1) insertAt = mcItemEnd; // append at end of block
		working.splice(insertAt, 0, ...ins.lines);
		shift(insertAt, ins.lines.length);
	}

	const newFm = working.join('\n');
	return `---\n${newFm}\n---\n${body}`;
}

// ---------------------------------------------------------------------------
// Per-item plan
// ---------------------------------------------------------------------------

function planEnrichment(mc, foodsByRef) {
	const plan = [];
	if (!mc || !mc.ref) return plan;
	const ref = mc.ref;

	// max_durability — only if currently 0/missing
	if (!mc.max_durability || mc.max_durability === 0) {
		const v = lookupMaxDurability(ref);
		if (v) plan.push({ field: 'max_durability', value: v });
	}

	// damage — only if block missing entirely
	if (!mc.damage) {
		const v = lookupDamage(ref);
		if (v) plan.push({ field: 'damage', value: v });
	}

	// mining — only if missing AND ref ends in pickaxe/axe/shovel/hoe
	if (!mc.mining) {
		const v = lookupMining(ref);
		if (v) plan.push({ field: 'mining', value: v });
	}

	// equipment — only if missing AND armor slot inferrable
	if (!mc.equipment) {
		const v = lookupEquipment(ref);
		if (v) plan.push({ field: 'equipment', value: v });
	}

	// food — only if missing AND in foods.json
	if (!mc.food) {
		const v = lookupFood(ref, foodsByRef);
		if (v) plan.push({ field: 'food', value: v });
	}

	// enchants — only if missing AND we have a category list
	if (!mc.enchants) {
		const list = enchantsForRef(ref);
		if (list && list.length > 0) plan.push({ field: 'enchants', value: { allowed: list } });
	}

	return plan;
}

function planToInsertions(plan) {
	const insertions = [];
	// max_durability is a scalar — insert before `tier:` if present, else before `tags:`
	for (const step of plan) {
		if (step.field === 'max_durability') {
			insertions.push({
				lines: [`    max_durability: ${step.value}`],
				beforeKey: 'tier',
				fallbackBeforeKey: ['tags', 'recipes', 'drop_sources', 'about', 'data_version'],
			});
		} else if (step.field === 'damage') {
			insertions.push({
				lines: formatYamlBlock('damage', step.value, '    '),
				beforeKey: 'tags',
				fallbackBeforeKey: ['recipes', 'drop_sources', 'about', 'data_version'],
			});
		} else if (step.field === 'mining') {
			insertions.push({
				lines: formatYamlBlock('mining', step.value, '    '),
				beforeKey: 'tags',
				fallbackBeforeKey: ['recipes', 'drop_sources', 'about', 'data_version'],
			});
		} else if (step.field === 'equipment') {
			insertions.push({
				lines: formatYamlBlock('equipment', step.value, '    '),
				beforeKey: 'tags',
				fallbackBeforeKey: ['recipes', 'drop_sources', 'about', 'data_version'],
			});
		} else if (step.field === 'food') {
			insertions.push({
				lines: formatYamlBlock('food', step.value, '    '),
				beforeKey: 'tags',
				fallbackBeforeKey: ['recipes', 'drop_sources', 'about', 'data_version'],
			});
		} else if (step.field === 'enchants') {
			insertions.push({
				lines: formatYamlBlock('enchants', step.value, '    '),
				beforeKey: 'tags',
				fallbackBeforeKey: ['recipes', 'drop_sources', 'about', 'data_version'],
			});
		}
	}
	return insertions;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function fetchJson(url) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`upstream HTTP ${res.status} for ${url}`);
	return res.json();
}

async function main() {
	console.log(`MC item enrichment${auditMode ? ' (AUDIT — no writes)' : ''}`);

	console.log(`  fetching ${ITEMS_URL}`);
	await fetchJson(ITEMS_URL); // sanity-check upstream reachable; values not used beyond foods

	console.log(`  fetching ${FOODS_URL}`);
	const foods = await fetchJson(FOODS_URL);
	const foodsByRef = new Map(foods.map((f) => [f.name, f]));
	console.log(`  ${foodsByRef.size} foods loaded`);

	const files = (await readdir(OUTPUT_DIR))
		.filter((f) => f.endsWith('.mdx'))
		.sort();
	console.log(`  ${files.length} MDX files to scan`);

	let changed = 0;
	let unchanged = 0;
	let failures = 0;
	const changedSamples = [];

	for (const file of files) {
		const path = join(OUTPUT_DIR, file);
		const content = await readFile(path, 'utf-8');
		const parsed = parseFrontmatter(content);
		if (!parsed || !parsed.frontmatter || !parsed.frontmatter.mc_item) {
			unchanged++;
			continue;
		}
		const plan = planEnrichment(parsed.frontmatter.mc_item, foodsByRef);
		if (plan.length === 0) {
			unchanged++;
			continue;
		}

		const insertions = planToInsertions(plan);
		const updated = injectIntoMcItem(content, insertions);
		if (!updated || updated === content) {
			failures++;
			continue;
		}

		if (auditMode) {
			changed++;
			if (changedSamples.length < 12) {
				changedSamples.push({
					file,
					fields: plan.map((p) => p.field),
				});
			}
		} else {
			await writeFile(path, updated, 'utf-8');
			changed++;
			if (changedSamples.length < 8) {
				changedSamples.push({ file, fields: plan.map((p) => p.field) });
			}
		}
	}

	console.log(`\n${auditMode ? 'Would change' : 'Changed'}: ${changed}`);
	console.log(`Unchanged:   ${unchanged}`);
	console.log(`Failures:    ${failures}`);
	if (changedSamples.length) {
		console.log(`\nSamples:`);
		for (const s of changedSamples) {
			console.log(`  ${s.file}  -> ${s.fields.join(', ')}`);
		}
	}
}

main().catch((err) => {
	console.error('enrich-mc-items failed:', err);
	process.exit(1);
});
