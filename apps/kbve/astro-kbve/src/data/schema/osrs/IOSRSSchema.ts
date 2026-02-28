/**
 * OSRS Equipment & Item Schema
 *
 * Comprehensive schema for Old School RuneScape item data including:
 * - Equipment stats (attack bonuses, defence bonuses, other bonuses)
 * - Skill requirements
 * - Equipment slot information
 * - Weapon-specific data (attack speed, combat style)
 * - Potion/consumable effects
 * - Set bonuses (Barrows, Void, etc.)
 * - Item sources (drops, shops, skilling)
 * - Creation recipes (herblore, crafting, smithing)
 * - SEO/meta information for Starlight
 *
 * This schema extends the base OSRS item data with detailed equipment information.
 * All fields are optional to maintain backwards compatibility with existing items.
 */

import { z } from 'astro:content';

// ============================================================================
// SEO / Meta Schema (Starlight Integration)
// ============================================================================

/**
 * Custom head tag for Starlight pages
 * Allows adding meta tags, scripts, links etc.
 */
export const OSRSHeadTagSchema = z.object({
	tag: z.enum([
		'meta',
		'link',
		'script',
		'style',
		'title',
		'base',
		'noscript',
		'template',
	]),
	attrs: z.record(z.union([z.string(), z.boolean()])).optional(),
	content: z.string().optional(),
});

export type OSRSHeadTag = z.infer<typeof OSRSHeadTagSchema>;

/**
 * SEO and meta information for OSRS item pages
 * Integrates with Starlight's built-in SEO features
 */
export const OSRSMetaSchema = z.object({
	// Page meta
	description: z.string().max(160).optional(), // Meta description (150-160 chars ideal)
	keywords: z.array(z.string()).optional(), // SEO keywords

	// Open Graph
	og_image: z.string().optional(), // Custom OG image URL
	og_image_alt: z.string().optional(), // OG image alt text
	og_type: z.enum(['article', 'website', 'product']).optional(),

	// Twitter Card
	twitter_card: z.enum(['summary', 'summary_large_image']).optional(),

	// Custom head tags
	head: z.array(OSRSHeadTagSchema).optional(),

	// Robots
	noindex: z.boolean().optional(), // Exclude from search engines

	// Canonical
	canonical: z.string().url().optional(), // Custom canonical URL
});

export type OSRSMeta = z.infer<typeof OSRSMetaSchema>;

// ============================================================================
// Item Properties Schema
// ============================================================================

/**
 * Core item properties from OSRS Wiki infobox
 */
export const OSRSItemPropertiesSchema = z.object({
	// Release info
	release_date: z.string().optional(), // ISO date or "DD Month YYYY"
	update: z.string().optional(), // Update name

	// Item flags
	tradeable: z.boolean().optional(),
	tradeable_ge: z.boolean().optional(), // Specifically tradeable on GE
	stackable: z.boolean().optional(),
	noteable: z.boolean().optional(),
	equipable: z.boolean().optional(),
	edible: z.boolean().optional(),

	// Quest association
	quest_item: z.boolean().optional(),
	quest: z.string().optional(), // Quest name if quest item

	// Options available
	options: z.array(z.string()).optional(), // e.g., ["Wield", "Drop", "Examine"]

	// Storage
	bankable: z.boolean().optional(),
	placeholder: z.boolean().optional(), // Can have bank placeholder

	// Physical
	weight: z.number().optional(), // kg

	// Leagues
	league_region: z.string().optional(),
});

export type OSRSItemProperties = z.infer<typeof OSRSItemPropertiesSchema>;

// ============================================================================
// Drop Source Schema
// ============================================================================

/**
 * Drop rarity categories used by OSRS Wiki
 */
export const OSRSDropRarities = [
	'always',
	'common',
	'uncommon',
	'rare',
	'very-rare',
	'varies',
] as const;

export type OSRSDropRarity = (typeof OSRSDropRarities)[number];

/**
 * Individual drop source entry
 */
export const OSRSDropSourceSchema = z
	.object({
		source: z.string(), // Monster/NPC name
		source_id: z.number().nullable().optional(), // Monster ID
		combat_level: z.number().nullable().optional(), // Made nullable for sources without combat levels
		quantity: z.string().nullable().optional(), // e.g., "1", "1-3", "1 (noted)"
		rarity: z.string().nullable().optional(), // Made flexible to accept any rarity string (e.g., "rare", "1/128", "7 × 1/2,448")
		drop_rate: z.string().nullable().optional(), // e.g., "1/128", "1/512"
		drop_rate_decimal: z.number().nullable().optional(), // Calculated decimal
		members_only: z.boolean().nullable().optional(),
		wilderness: z.boolean().nullable().optional(),
	})
	.passthrough();

export type OSRSDropSource = z.infer<typeof OSRSDropSourceSchema>;

/**
 * Collection of drop sources for an item
 * Accepts either an object with sources array, or directly an array of sources
 */
export const OSRSDropTableSchema = z.union([
	// Object format: { sources: [...], primary_source: "...", ... }
	z.object({
		sources: z.array(OSRSDropSourceSchema).optional(),
		primary_source: z.string().optional(),
		best_drop_rate: z.string().optional(),
	}),
	// Array format: direct array of drop sources
	z.array(OSRSDropSourceSchema),
]);

export type OSRSDropTable = z.infer<typeof OSRSDropTableSchema>;

// ============================================================================
// Shop Source Schema
// ============================================================================

/**
 * Shop where item can be purchased
 */
export const OSRSShopSourceSchema = z.object({
	shop_name: z.string(),
	location: z.string().optional(),
	price: z.union([z.number(), z.string()]).optional(), // Purchase price (can be string like "Free")
	stock: z.union([z.number(), z.string()]).optional(), // Default stock amount (can be string like "Unlimited")
	members_only: z.boolean().optional(),
	currency: z.string().optional(), // Default "coins", could be "tokkul", etc.
});

export type OSRSShopSource = z.infer<typeof OSRSShopSourceSchema>;

// ============================================================================
// Creation / Recipe Schema
// ============================================================================

/**
 * Skills that can be used for creation
 */
export const OSRSCreationSkills = [
	'herblore',
	'crafting',
	'smithing',
	'fletching',
	'cooking',
	'construction',
	'runecraft',
	'magic',
	'firemaking',
] as const;

export type OSRSCreationSkill = (typeof OSRSCreationSkills)[number];

/**
 * Material/ingredient for a recipe
 */
export const OSRSMaterialSchema = z.object({
	item_id: z.number().optional(),
	item_name: z.string(),
	quantity: z.number().default(1),
	consumed: z.boolean().default(true), // Is the material consumed?
});

export type OSRSMaterial = z.infer<typeof OSRSMaterialSchema>;

// Helper to auto-lowercase skill names for consistency
const lowercaseSkill = z
	.string()
	.transform((s) => s.toLowerCase())
	.nullable()
	.optional();

/**
 * Recipe for creating an item
 */
export const OSRSRecipeSchema = z
	.object({
		skill: lowercaseSkill, // Auto-lowercases for consistency
		level: z.number().min(0).max(99).nullable().optional(), // Made optional, min(0) for items with no skill req
		xp: z.number().nullable().optional(),

		// Materials
		materials: z.array(OSRSMaterialSchema).nullable().optional(),

		// Tools required (not consumed)
		tools: z.array(z.string()).nullable().optional(),

		// Facilities
		facility: z.string().nullable().optional(), // e.g., "Furnace", "Anvil", "Range"

		// Timing
		ticks: z.number().nullable().optional(), // Game ticks per action

		// Special conditions
		quest_required: z.string().nullable().optional(),
		members_only: z.boolean().nullable().optional(),

		// Output
		output_quantity: z.number().nullable().optional(),
	})
	.passthrough(); // Allow additional fields like product, product_id, location, etc.

export type OSRSRecipe = z.infer<typeof OSRSRecipeSchema>;

// ============================================================================
// Skilling Data Schema
// ============================================================================

/**
 * Data for items obtained via skilling (fishing, mining, etc.)
 */
export const OSRSSkillingSourceSchema = z.object({
	skill: z.string().transform((s) => s.toLowerCase()), // Auto-lowercase
	level: z.number().min(1).max(99),
	xp: z.number().optional(),

	// Location/method
	location: z.string().optional(),
	method: z.string().optional(), // e.g., "Net fishing", "Pickpocket"

	// Rates
	catch_rate: z.number().optional(), // Items per hour at max efficiency
	success_rate: z.number().optional(), // Percentage at level

	// Requirements
	tool: z.string().optional(),
	bait: z.string().optional(),
	members_only: z.boolean().optional(),
});

export type OSRSSkillingSource = z.infer<typeof OSRSSkillingSourceSchema>;

// ============================================================================
// Cooking-Specific Schema
// ============================================================================

/**
 * Cooking data including burn rates
 */
export const OSRSCookingSchema = z
	.object({
		level: z.number().min(0).max(99).nullable().optional(),
		xp: z.number().nullable().optional(),

		// Burn info
		stop_burn_level: z.number().nullable().optional(), // Level to stop burning entirely
		stop_burn_level_gauntlets: z.number().nullable().optional(), // With cooking gauntlets
		stop_burn_level_hosidius: z.number().nullable().optional(), // With Hosidius range

		// Success rates at various levels
		burn_rates: z
			.array(
				z
					.object({
						level: z.number().nullable().optional(),
						fire_rate: z.number().nullable().optional(), // Success % on fire
						range_rate: z.number().nullable().optional(), // Success % on range
						gauntlets_rate: z.number().nullable().optional(), // With cooking gauntlets
					})
					.passthrough(),
			)
			.nullable()
			.optional(),

		// Raw item
		raw_item_id: z.number().nullable().optional(),
		raw_item_name: z.string().nullable().optional(),

		// Timing
		ticks: z.number().nullable().optional(),

		// Burnt version
		burnt_item_id: z.number().nullable().optional(),
	})
	.passthrough();

export type OSRSCooking = z.infer<typeof OSRSCookingSchema>;

// ============================================================================
// Treasure Trail Schema
// ============================================================================

/**
 * Clue scroll / treasure trail data
 */
export const OSRSTreasureTrailSchema = z.object({
	tier: z.enum(['beginner', 'easy', 'medium', 'hard', 'elite', 'master']),

	// Emote clue data
	emotes: z.array(z.string()).optional(),
	stash_location: z.string().optional(),
	required_items: z.array(z.string()).optional(),

	// Reward data
	is_reward: z.boolean().optional(),
	reward_tiers: z
		.array(
			z.enum(['beginner', 'easy', 'medium', 'hard', 'elite', 'master']),
		)
		.optional(),
});

export type OSRSTreasureTrail = z.infer<typeof OSRSTreasureTrailSchema>;

// ============================================================================
// Related Items Schema
// ============================================================================

/**
 * Related item reference
 */
export const OSRSRelatedItemSchema = z.object({
	item_id: z.number().optional(), // Made optional for simpler override entries
	item_name: z.string().optional(), // Made optional for simpler override entries
	slug: z.string().optional(), // URL slug for linking (e.g., "abyssal-tentacle")
	relationship: z
		.enum([
			'variant', // Different charge/dose level
			'upgrade', // Upgraded version
			'downgrade', // Downgraded version
			'component', // Used to make this item
			'product', // Made from this item
			'set-piece', // Part of same set
			'alternative', // Alternative option
		])
		.optional(), // Made optional for simpler override entries
	description: z.string().optional(),
});

export type OSRSRelatedItem = z.infer<typeof OSRSRelatedItemSchema>;

// ============================================================================
// Equipment Slot Types
// ============================================================================

/**
 * All possible equipment slots in OSRS
 */
export const OSRSEquipmentSlots = [
	'head',
	'cape',
	'neck',
	'ammo',
	'weapon',
	'body',
	'shield',
	'legs',
	'hands',
	'feet',
	'ring',
	'2h', // Two-handed weapons
] as const;

export type OSRSEquipmentSlot = (typeof OSRSEquipmentSlots)[number];

export const OSRSEquipmentSlotSchema = z.enum(OSRSEquipmentSlots);

// ============================================================================
// Weapon Types & Attack Styles
// ============================================================================

/**
 * Weapon categories for combat style determination
 */
export const OSRSWeaponTypes = [
	'unarmed',
	'axe',
	'blunt',
	'bow',
	'bulwark',
	'chinchompa',
	'claw',
	'crossbow',
	'gun',
	'pickaxe',
	'polearm',
	'polestaff',
	'powered-staff',
	'salamander',
	'scythe',
	'slash-sword',
	'spear',
	'spiked',
	'stab-sword',
	'staff',
	'thrown',
	'two-handed-sword',
	'whip',
] as const;

export type OSRSWeaponType = (typeof OSRSWeaponTypes)[number];

export const OSRSWeaponTypeSchema = z.enum(OSRSWeaponTypes);

/**
 * Combat styles available in OSRS
 */
export const OSRSCombatStyles = [
	'stab',
	'slash',
	'crush',
	'magic',
	'ranged',
	'defensive',
	'controlled',
	'accurate',
	'aggressive',
	'rapid',
	'longrange',
] as const;

export type OSRSCombatStyle = (typeof OSRSCombatStyles)[number];

export const OSRSCombatStyleSchema = z.enum(OSRSCombatStyles);

// ============================================================================
// Stat Bonuses
// ============================================================================

/**
 * Attack bonus stats (offensive)
 */
export const OSRSAttackBonusSchema = z.object({
	stab: z.number().optional(),
	slash: z.number().optional(),
	crush: z.number().optional(),
	magic: z.number().optional(),
	ranged: z.number().optional(),
});

export type OSRSAttackBonus = z.infer<typeof OSRSAttackBonusSchema>;

/**
 * Defence bonus stats
 */
export const OSRSDefenceBonusSchema = z.object({
	stab: z.number().optional(),
	slash: z.number().optional(),
	crush: z.number().optional(),
	magic: z.number().optional(),
	ranged: z.number().optional(),
});

export type OSRSDefenceBonus = z.infer<typeof OSRSDefenceBonusSchema>;

/**
 * Other bonus stats (strength, prayer, etc.)
 */
export const OSRSOtherBonusSchema = z.object({
	melee_strength: z.number().optional(),
	ranged_strength: z.number().optional(),
	magic_damage: z.number().optional(), // Percentage (e.g., 5 = 5%)
	prayer: z.number().optional(),
});

export type OSRSOtherBonus = z.infer<typeof OSRSOtherBonusSchema>;

// ============================================================================
// Skill Requirements
// ============================================================================

/**
 * All skills that can be requirements for equipment
 */
export const OSRSSkills = [
	'attack',
	'strength',
	'defence',
	'ranged',
	'prayer',
	'magic',
	'runecraft',
	'hitpoints',
	'crafting',
	'mining',
	'smithing',
	'fishing',
	'cooking',
	'firemaking',
	'woodcutting',
	'agility',
	'herblore',
	'thieving',
	'fletching',
	'slayer',
	'farming',
	'construction',
	'hunter',
] as const;

export type OSRSSkill = (typeof OSRSSkills)[number];

/**
 * Skill requirements schema - maps skill name to level required
 */
export const OSRSRequirementsSchema = z.object({
	attack: z.number().min(1).max(99).optional(),
	strength: z.number().min(1).max(99).optional(),
	defence: z.number().min(1).max(99).optional(),
	ranged: z.number().min(1).max(99).optional(),
	prayer: z.number().min(1).max(99).optional(),
	magic: z.number().min(1).max(99).optional(),
	runecraft: z.number().min(1).max(99).optional(),
	hitpoints: z.number().min(1).max(99).optional(),
	crafting: z.number().min(1).max(99).optional(),
	mining: z.number().min(1).max(99).optional(),
	smithing: z.number().min(1).max(99).optional(),
	fishing: z.number().min(1).max(99).optional(),
	cooking: z.number().min(1).max(99).optional(),
	firemaking: z.number().min(1).max(99).optional(),
	woodcutting: z.number().min(1).max(99).optional(),
	agility: z.number().min(1).max(99).optional(),
	herblore: z.number().min(1).max(99).optional(),
	thieving: z.number().min(1).max(99).optional(),
	fletching: z.number().min(1).max(99).optional(),
	slayer: z.number().min(1).max(99).optional(),
	farming: z.number().min(1).max(99).optional(),
	construction: z.number().min(1).max(99).optional(),
	hunter: z.number().min(1).max(99).optional(),
	// Quest requirements stored as string
	quest: z.string().optional(),
});

export type OSRSRequirements = z.infer<typeof OSRSRequirementsSchema>;

// ============================================================================
// Equipment Info
// ============================================================================

/**
 * Complete equipment information schema
 */
export const OSRSEquipmentSchema = z
	.object({
		// Slot and type - accepts enum values or any string for flexibility
		slot: z.string().nullable().optional(),
		weapon_type: z.string().nullable().optional(),

		// Physical properties
		weight: z.number().nullable().optional(), // kg

		// Combat stats
		attack_speed: z.number().min(1).max(10).nullable().optional(), // Game ticks
		attack_range: z.number().min(1).max(10).nullable().optional(), // Tiles

		// Requirements
		requirements: OSRSRequirementsSchema.nullable().optional(),

		// Stat bonuses
		attack_bonus: OSRSAttackBonusSchema.nullable().optional(),
		defence_bonus: OSRSDefenceBonusSchema.nullable().optional(),
		other_bonus: OSRSOtherBonusSchema.nullable().optional(),

		// Trading info
		tradeable: z.boolean().nullable().optional(),

		// Degradation
		degradable: z.boolean().nullable().optional(),
		degrade_hours: z.number().nullable().optional(), // Hours of combat
	})
	.passthrough();

export type OSRSEquipment = z.infer<typeof OSRSEquipmentSchema>;

// ============================================================================
// Special Attack
// ============================================================================

/**
 * Weapon special attack information
 */
export const OSRSSpecialAttackSchema = z
	.object({
		name: z.string().optional(),
		energy: z.number().min(0).max(100).optional(), // Special attack energy cost (%)
		description: z.string().optional(),
		// Effects
		accuracy_modifier: z.number().optional(), // Multiplier (e.g., 2 = double accuracy)
		damage_modifier: z.number().optional(), // Multiplier (e.g., 1.25 = +25% damage)
		// Special effects
		heals: z.boolean().optional(),
		drains_defence: z.boolean().optional(),
		drains_stats: z.boolean().optional(),
		freezes: z.boolean().optional(),
		freeze_duration: z.number().optional(), // Ticks
	})
	.passthrough(); // Allow additional fields like cost, effects array, etc.

export type OSRSSpecialAttack = z.infer<typeof OSRSSpecialAttackSchema>;

// ============================================================================
// Set Bonus
// ============================================================================

/**
 * Equipment set bonus (Barrows, Void, Inquisitor, etc.)
 */
export const OSRSSetBonusSchema = z.object({
	set_name: z.string().optional(),
	pieces_required: z.number().min(2).max(5).optional(), // Made optional for simpler entries
	description: z.string().optional(), // Made optional for simpler entries
	// Set piece item IDs
	pieces: z.array(z.number()).optional(),
});

export type OSRSSetBonus = z.infer<typeof OSRSSetBonusSchema>;

// ============================================================================
// Potion / Consumable Effects
// ============================================================================

/**
 * Potion dose information
 */
export const OSRSPotionSchema = z
	.object({
		doses: z.number().min(0).max(4).nullable().optional(), // min(0) for unfinished potions
		// Creation info
		herblore_level: z.number().min(1).max(99).nullable().optional(),
		herblore_xp: z.number().nullable().optional(),
		// Effects per dose
		effects: z
			.array(
				z
					.object({
						stat: z
							.string()
							.transform((s) => s.toLowerCase())
							.nullable()
							.optional(), // Auto-lowercase stat/skill names
						boost_type: z.string().nullable().optional(), // Made flexible to accept any string (flat, percentage, formula, boost, etc.)
						boost_value: z.number().nullable().optional(),
						boost_formula: z.string().nullable().optional(), // e.g., "floor(level * 0.15) + 2"
						duration: z.number().nullable().optional(), // Ticks
					})
					.passthrough(),
			)
			.nullable()
			.optional(),
	})
	.passthrough();

export type OSRSPotion = z.infer<typeof OSRSPotionSchema>;

// ============================================================================
// Food / Healing
// ============================================================================

/**
 * Food and healing item information
 */
export const OSRSFoodSchema = z
	.object({
		heals: z.number().nullable().optional(), // HP healed
		heals_formula: z.string().nullable().optional(), // For items like Anglerfish
		overheal: z.boolean().nullable().optional(), // Can heal above max HP
		cooking_level: z.number().min(1).max(99).nullable().optional(),
		cooking_xp: z.number().nullable().optional(),
		burn_level: z.number().nullable().optional(), // Level to stop burning
	})
	.passthrough();

export type OSRSFood = z.infer<typeof OSRSFoodSchema>;

// ============================================================================
// Complete Extended OSRS Item Schema
// ============================================================================

/**
 * Extended OSRS frontmatter schema with all optional equipment data
 *
 * This extends the base OSRS item data with detailed equipment information.
 * All equipment fields are optional to maintain backwards compatibility.
 */
export const OSRSExtendedSchema = z.object({
	// Base item data (from Wiki API)
	id: z.number(),
	name: z.string(),
	slug: z.string(),
	examine: z.string(),
	members: z.boolean(),
	icon: z.string(),
	value: z.number(),
	lowalch: z.number().nullable(),
	highalch: z.number().nullable(),
	limit: z.number().nullable(),

	// SEO / Meta (optional, Starlight integration)
	meta: OSRSMetaSchema.optional(),

	// Item properties (optional, from Wiki infobox)
	properties: OSRSItemPropertiesSchema.optional(),

	// Equipment data (optional)
	equipment: OSRSEquipmentSchema.optional(),
	special_attack: OSRSSpecialAttackSchema.optional(),
	set_bonus: OSRSSetBonusSchema.optional(),

	// Consumable data (optional)
	potion: OSRSPotionSchema.optional(),
	food: OSRSFoodSchema.optional(),
	cooking: OSRSCookingSchema.optional(),

	// Sources (optional)
	drop_table: OSRSDropTableSchema.optional(),
	shops: z.array(OSRSShopSourceSchema).optional(),
	skilling_source: OSRSSkillingSourceSchema.optional(),

	// Creation (optional)
	recipes: z.array(OSRSRecipeSchema).optional(),

	// Treasure trails (optional)
	treasure_trail: OSRSTreasureTrailSchema.optional(),

	// Related items (optional)
	related_items: z.array(OSRSRelatedItemSchema).optional(),
});

export type OSRSExtended = z.infer<typeof OSRSExtendedSchema>;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if an OSRS item has equipment data
 */
export function hasEquipment(
	item: OSRSExtended,
): item is OSRSExtended & { equipment: OSRSEquipment } {
	return item.equipment !== undefined;
}

/**
 * Check if an OSRS item is a weapon
 */
export function isWeapon(item: OSRSExtended): boolean {
	return item.equipment?.slot === 'weapon' || item.equipment?.slot === '2h';
}

/**
 * Check if an OSRS item has a special attack
 */
export function hasSpecialAttack(
	item: OSRSExtended,
): item is OSRSExtended & { special_attack: OSRSSpecialAttack } {
	return item.special_attack !== undefined;
}

/**
 * Check if an OSRS item is part of a set
 */
export function hasSetBonus(
	item: OSRSExtended,
): item is OSRSExtended & { set_bonus: OSRSSetBonus } {
	return item.set_bonus !== undefined;
}

/**
 * Check if an OSRS item is a potion
 */
export function isPotion(
	item: OSRSExtended,
): item is OSRSExtended & { potion: OSRSPotion } {
	return item.potion !== undefined;
}

/**
 * Check if an OSRS item is food
 */
export function isFood(
	item: OSRSExtended,
): item is OSRSExtended & { food: OSRSFood } {
	return item.food !== undefined;
}

/**
 * Check if an OSRS item has cooking data
 */
export function hasCooking(
	item: OSRSExtended,
): item is OSRSExtended & { cooking: OSRSCooking } {
	return item.cooking !== undefined;
}

/**
 * Check if an OSRS item has drop sources
 */
export function hasDropSources(
	item: OSRSExtended,
): item is OSRSExtended & { drop_table: OSRSDropTable } {
	if (item.drop_table === undefined) return false;
	// Handle both array format and object format
	if (Array.isArray(item.drop_table)) {
		return item.drop_table.length > 0;
	}
	return (item.drop_table.sources?.length ?? 0) > 0;
}

/**
 * Check if an OSRS item can be purchased from shops
 */
export function hasShopSources(item: OSRSExtended): boolean {
	return (item.shops?.length ?? 0) > 0;
}

/**
 * Check if an OSRS item has crafting/creation recipes
 */
export function hasRecipes(item: OSRSExtended): boolean {
	return (item.recipes?.length ?? 0) > 0;
}

/**
 * Check if an OSRS item is related to treasure trails
 */
export function isTreasureTrailItem(
	item: OSRSExtended,
): item is OSRSExtended & { treasure_trail: OSRSTreasureTrail } {
	return item.treasure_trail !== undefined;
}

/**
 * Check if an OSRS item has custom meta/SEO data
 */
export function hasMeta(
	item: OSRSExtended,
): item is OSRSExtended & { meta: OSRSMeta } {
	return item.meta !== undefined;
}

/**
 * Check if an OSRS item has extended properties
 */
export function hasProperties(
	item: OSRSExtended,
): item is OSRSExtended & { properties: OSRSItemProperties } {
	return item.properties !== undefined;
}

/**
 * Check if an OSRS item is tradeable
 */
export function isTradeable(item: OSRSExtended): boolean {
	return (
		item.properties?.tradeable === true ||
		item.properties?.tradeable_ge === true
	);
}

/**
 * Check if an OSRS item is a quest item
 */
export function isQuestItem(item: OSRSExtended): boolean {
	return item.properties?.quest_item === true;
}

/**
 * Check if an OSRS item has related items
 */
export function hasRelatedItems(item: OSRSExtended): boolean {
	return (item.related_items?.length ?? 0) > 0;
}

/**
 * Generate a default meta description for an OSRS item
 */
export function generateMetaDescription(item: OSRSExtended): string {
	const parts: string[] = [item.name];

	if (item.members) {
		parts.push('(P2P)');
	}

	if (hasEquipment(item) && item.equipment.slot) {
		parts.push(`- ${item.equipment.slot} slot equipment`);
	} else if (isPotion(item)) {
		parts.push('- potion');
	} else if (isFood(item)) {
		parts.push(`- heals ${item.food.heals ?? '?'} HP`);
	}

	parts.push(`in Old School RuneScape. ${item.examine}`);

	// Truncate to 160 chars
	const description = parts.join(' ');
	return description.length > 160
		? description.substring(0, 157) + '...'
		: description;
}
