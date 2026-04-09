/**
 * Proto-Aligned OSRS Zod Schema
 *
 * This file mirrors the structure defined in packages/data/proto/kbve/osrs.proto
 * and serves as the Zod validation layer for OSRS item frontmatter in Astro
 * content collections.
 *
 * Proto is the single source of truth for the data model. This Zod schema
 * validates MDX frontmatter against that model. Where field names differ
 * between proto and MDX convention, the MDX name is used with a comment
 * noting the proto field name.
 *
 * Proto message → Zod schema mapping:
 *   OSRSAttackBonus          → OSRSAttackBonusSchema
 *   OSRSDefenceBonus         → OSRSDefenceBonusSchema
 *   OSRSOtherBonus           → OSRSOtherBonusSchema
 *   OSRSRequirements         → OSRSRequirementsSchema
 *   OSRSEquipment            → OSRSEquipmentSchema
 *   OSRSSpecialAttack        → OSRSSpecialAttackSchema
 *   OSRSSetBonus             → OSRSSetBonusSchema
 *   OSRSDropSource           → OSRSDropSourceSchema
 *   OSRSRecipeMaterial       → OSRSMaterialSchema          (recipe ingredients)
 *   OSRSRecipe               → OSRSRecipeSchema
 *   OSRSEffect               → (inline in OSRSPotionSchema.effects)
 *   OSRSConsumable           → OSRSPotionSchema             (renamed for MDX compat)
 *   OSRSFood                 → OSRSFoodSchema
 *   OSRSCookingBurnRate      → (inline in OSRSCookingSchema.burn_rates)
 *   OSRSCooking              → OSRSCookingSchema
 *   OSRSShopSource           → OSRSShopSourceSchema
 *   OSRSSkillingSource       → OSRSSkillingSourceSchema
 *   OSRSTreasureTrail        → OSRSTreasureTrailSchema
 *   OSRSRelatedItem          → OSRSRelatedItemSchema
 *   OSRSItemProperties       → OSRSItemPropertiesSchema
 *   OSRSMeta                 → OSRSMetaSchema
 *   OSRSPrice                → OSRSPriceSchema
 *   OSRSAbout                → OSRSAboutSchema
 *   OSRSMarketStep           → OSRSMarketStepSchema
 *   OSRSMarketStrategy       → OSRSMarketStrategySchema
 *   OSRSMaterial             → OSRSItemMaterialSchema       (item classification)
 *   OSRSPrayer               → OSRSPrayerSchema
 *   OSRSGathering            → OSRSGatheringSchema
 *   OSRSTeleportDestination  → OSRSTeleportDestinationSchema
 *   OSRSTeleport             → OSRSTeleportSchema
 *   OSRSQuestRequirement     → OSRSQuestRequirementSchema
 *   OSRSQuestData            → OSRSQuestDataSchema
 *   OSRSFarming              → OSRSFarmingSchema
 *   OSRSCharges              → OSRSChargesSchema
 *   OSRSSlayer               → OSRSSlayerSchema
 *   OSRSConstruction         → OSRSConstructionSchema
 *   OSRSPassiveEffect        → OSRSPassiveEffectSchema
 *   OSRSAmmunition           → OSRSAmmunitionSchema
 *   OSRSItem                 → OSRSExtendedSchema
 *
 * Field name differences (proto → MDX):
 *   ge_limit     → limit
 *   drop_sources → drop_table (supports both array and object format)
 *   consumable   → potion
 *   material     → item_material (avoids collision with recipe OSRSMaterialSchema)
 *
 * Skill enum: proto uses OSRSSkill enum for skill references. Zod accepts
 * lowercase strings validated against the OSRSSkills array. The deprecated
 * OSRSRecipeSkill enum is replaced by OSRSSkill everywhere.
 *
 * Future: proto → JSON Schema → Zod codegen pipeline
 *   buf.gen.yaml has a commented-out protoschema-jsonschema plugin.
 *   Once json-schema-to-zod supports Draft 2020-12 + protobuf patterns,
 *   this file can be fully generated with a thin refinement layer.
 */

import { z } from 'astro:content';

// ============================================================================
// Shared — proto: OSRSSkill enum
// ============================================================================

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

/** Lowercase transform for skill strings from MDX frontmatter */
const lowercaseSkill = z
	.string()
	.transform((s) => s.toLowerCase())
	.nullable()
	.optional();

// ============================================================================
// SEO / Meta — proto: OSRSMeta
// ============================================================================

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
	attrs: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
	content: z.string().optional(),
});

export type OSRSHeadTag = z.infer<typeof OSRSHeadTagSchema>;

export const OSRSMetaSchema = z.object({
	description: z.string().max(160).optional(), // proto: description
	keywords: z.array(z.string()).optional(), // proto: keywords
	og_image: z.string().optional(), // proto: og_image
	og_image_alt: z.string().optional(),
	og_type: z.enum(['article', 'website', 'product']).optional(),
	twitter_card: z.enum(['summary', 'summary_large_image']).optional(),
	head: z.array(OSRSHeadTagSchema).optional(),
	noindex: z.boolean().optional(),
	canonical: z.string().url().optional(), // proto: canonical
});

export type OSRSMeta = z.infer<typeof OSRSMetaSchema>;

// ============================================================================
// Item Properties — proto: OSRSItemProperties
// ============================================================================

export const OSRSItemPropertiesSchema = z.object({
	release_date: z.string().optional(),
	update: z.string().optional(),
	tradeable: z.boolean().optional(),
	tradeable_ge: z.boolean().optional(),
	stackable: z.boolean().optional(),
	noteable: z.boolean().optional(),
	equipable: z.boolean().optional(),
	edible: z.boolean().optional(),
	quest_item: z.boolean().optional(),
	quest: z.string().optional(),
	options: z.array(z.string()).optional(), // proto: options (inventory right-click)
	bankable: z.boolean().optional(),
	placeholder: z.boolean().optional(),
	weight: z.number().optional(),
	destroy: z.string().optional(), // proto: destroy — warning text
	respawn: z.number().optional(), // proto: respawn — ground spawn ticks
	worn_options: z.array(z.string()).optional(), // proto: worn_options
	alchable: z.boolean().optional(), // proto: alchable
	league_region: z.string().optional(), // MDX-only, not in proto
});

export type OSRSItemProperties = z.infer<typeof OSRSItemPropertiesSchema>;

// ============================================================================
// Equipment Slots — proto: OSRSSlot enum
// ============================================================================

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
	'2h',
] as const;

export type OSRSEquipmentSlot = (typeof OSRSEquipmentSlots)[number];

export const OSRSEquipmentSlotSchema = z.enum(OSRSEquipmentSlots);

// ============================================================================
// Weapon Types — proto: OSRSWeaponType enum
// ============================================================================

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

// ============================================================================
// Combat Styles (frontend-only, not in proto)
// ============================================================================

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
// Stat Bonuses — proto: OSRSAttackBonus, OSRSDefenceBonus, OSRSOtherBonus
// ============================================================================

export const OSRSAttackBonusSchema = z.object({
	stab: z.number().optional(),
	slash: z.number().optional(),
	crush: z.number().optional(),
	magic: z.number().optional(),
	ranged: z.number().optional(),
});

export type OSRSAttackBonus = z.infer<typeof OSRSAttackBonusSchema>;

export const OSRSDefenceBonusSchema = z.object({
	stab: z.number().optional(),
	slash: z.number().optional(),
	crush: z.number().optional(),
	magic: z.number().optional(),
	ranged: z.number().optional(),
});

export type OSRSDefenceBonus = z.infer<typeof OSRSDefenceBonusSchema>;

export const OSRSOtherBonusSchema = z.object({
	melee_strength: z.number().optional(),
	ranged_strength: z.number().optional(),
	magic_damage: z.number().optional(),
	prayer: z.number().optional(),
});

export type OSRSOtherBonus = z.infer<typeof OSRSOtherBonusSchema>;

// ============================================================================
// Skill Requirements — proto: OSRSRequirements
// ============================================================================

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
	quest: z.string().optional(),
});

export type OSRSRequirements = z.infer<typeof OSRSRequirementsSchema>;

// ============================================================================
// Equipment — proto: OSRSEquipment
// ============================================================================

export const OSRSEquipmentSchema = z
	.object({
		slot: z.string().nullable().optional(), // proto: OSRSSlot enum
		weapon_type: z.string().nullable().optional(), // proto: OSRSWeaponType enum
		weight: z.number().nullable().optional(),
		attack_speed: z.number().min(1).max(10).nullable().optional(),
		attack_range: z.number().min(1).max(10).nullable().optional(),
		tradeable: z.boolean().nullable().optional(),
		degradable: z.boolean().nullable().optional(),
		degrade_hours: z.number().nullable().optional(),
		requirements: OSRSRequirementsSchema.nullable().optional(),
		attack_bonus: OSRSAttackBonusSchema.nullable().optional(),
		defence_bonus: OSRSDefenceBonusSchema.nullable().optional(),
		other_bonus: OSRSOtherBonusSchema.nullable().optional(),
	})
	.passthrough();

export type OSRSEquipment = z.infer<typeof OSRSEquipmentSchema>;

// ============================================================================
// Special Attack — proto: OSRSSpecialAttack
// ============================================================================

export const OSRSSpecialAttackSchema = z
	.object({
		name: z.string().optional(),
		energy: z.number().min(0).max(100).optional(),
		description: z.string().optional(),
		accuracy_modifier: z.number().optional(),
		damage_modifier: z.number().optional(),
		heals: z.boolean().optional(),
		drains_defence: z.boolean().optional(),
		drains_stats: z.boolean().optional(),
		freezes: z.boolean().optional(),
		freeze_duration: z.number().optional(),
	})
	.passthrough();

export type OSRSSpecialAttack = z.infer<typeof OSRSSpecialAttackSchema>;

// ============================================================================
// Set Bonus — proto: OSRSSetBonus
// ============================================================================

export const OSRSSetBonusSchema = z.object({
	set_name: z.string().optional(),
	pieces_required: z.number().min(2).max(5).optional(),
	description: z.string().optional(),
	pieces: z.array(z.number()).optional(),
});

export type OSRSSetBonus = z.infer<typeof OSRSSetBonusSchema>;

// ============================================================================
// Drop Sources — proto: OSRSDropSource
// ============================================================================

export const OSRSDropRarities = [
	'always',
	'common',
	'uncommon',
	'rare',
	'very-rare',
	'varies',
] as const;

export type OSRSDropRarity = (typeof OSRSDropRarities)[number];

export const OSRSDropSourceSchema = z
	.object({
		source: z.string(), // proto: source
		source_id: z.number().nullable().optional(), // MDX-only
		combat_level: z.number().nullable().optional(),
		quantity: z.string().nullable().optional(),
		rarity: z.string().nullable().optional(), // proto: OSRSRarity enum
		drop_rate: z.string().nullable().optional(),
		drop_rate_decimal: z.number().nullable().optional(), // MDX-only
		members_only: z.boolean().nullable().optional(),
		wilderness: z.boolean().nullable().optional(),
	})
	.passthrough();

export type OSRSDropSource = z.infer<typeof OSRSDropSourceSchema>;

/**
 * Drop table — proto uses flat `repeated OSRSDropSource drop_sources`,
 * but MDX frontmatter supports both object format and array format.
 * MDX field name: drop_table (proto: drop_sources)
 */
export const OSRSDropTableSchema = z.union([
	z.object({
		sources: z.array(OSRSDropSourceSchema).optional(),
		primary_source: z.string().optional(),
		best_drop_rate: z.string().optional(),
	}),
	z.array(OSRSDropSourceSchema),
]);

export type OSRSDropTable = z.infer<typeof OSRSDropTableSchema>;

// ============================================================================
// Shop Sources — proto: OSRSShopSource
// ============================================================================

export const OSRSShopSourceSchema = z.object({
	shop_name: z.string(),
	location: z.string().optional(),
	price: z.union([z.number(), z.string()]).optional(),
	stock: z.union([z.number(), z.string()]).optional(),
	members_only: z.boolean().optional(), // MDX-only
	currency: z.string().optional(),
	requirements: z.string().optional(), // Quest or skill required to access shop
});

export type OSRSShopSource = z.infer<typeof OSRSShopSourceSchema>;

// ============================================================================
// Skilling Sources — proto: OSRSSkillingSource
// ============================================================================

export const OSRSSkillingSourceSchema = z.object({
	skill: z.string().transform((s) => s.toLowerCase()), // proto: OSRSSkill enum
	level: z.number().min(1).max(99),
	xp: z.number().optional(),
	location: z.string().optional(),
	method: z.string().optional(),
	catch_rate: z.number().optional(),
	success_rate: z.number().optional(),
	tool: z.string().optional(),
	bait: z.string().optional(),
	members_only: z.boolean().optional(),
});

export type OSRSSkillingSource = z.infer<typeof OSRSSkillingSourceSchema>;

// ============================================================================
// Recipes — proto: OSRSRecipe, OSRSRecipeMaterial
// ============================================================================

/**
 * Deprecated: use OSRSSkills instead for skill validation.
 * Kept for backwards compatibility with existing code that imports it.
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

/** proto: OSRSRecipeMaterial — ingredients for a recipe */
export const OSRSMaterialSchema = z.object({
	item_id: z.number().optional(),
	item_name: z.string(),
	quantity: z.union([z.number(), z.string()]).default(1), // May be range like "2-3"
	consumed: z.boolean().default(true),
});

export type OSRSMaterial = z.infer<typeof OSRSMaterialSchema>;

export const OSRSRecipeSchema = z
	.object({
		skill: lowercaseSkill, // proto: OSRSSkill enum
		level: z.number().min(0).max(99).nullable().optional(),
		xp: z.number().nullable().optional(),
		materials: z.array(OSRSMaterialSchema).nullable().optional(),
		tools: z.array(z.string()).nullable().optional(), // MDX-only
		facility: z.string().nullable().optional(),
		ticks: z.number().nullable().optional(),
		quest_required: z.string().nullable().optional(), // MDX-only
		members_only: z.boolean().nullable().optional(), // MDX-only
		output_quantity: z.number().nullable().optional(), // MDX-only
		product: z.string().nullable().optional(), // Output item name
		product_id: z.number().nullable().optional(), // Output item ID
		product_quantity: z
			.union([z.number(), z.string()])
			.nullable()
			.optional(), // Output quantity, may be range like "3-6"
	})
	.passthrough();

export type OSRSRecipe = z.infer<typeof OSRSRecipeSchema>;

// ============================================================================
// Consumables — proto: OSRSConsumable → MDX: potion
// ============================================================================

/** proto: OSRSConsumable (renamed to potion for MDX backwards compat) */
export const OSRSPotionSchema = z
	.object({
		doses: z.number().min(0).max(4).nullable().optional(),
		herblore_level: z.number().min(1).max(99).nullable().optional(),
		herblore_xp: z.number().nullable().optional(),
		effect: z.string().nullable().optional(), // Human-readable effect summary
		effects: z
			.array(
				z
					.object({
						stat: lowercaseSkill, // proto: OSRSSkill enum
						boost_type: z.string().nullable().optional(),
						boost_value: z.number().nullable().optional(),
						boost_formula: z.string().nullable().optional(),
						duration: z.number().nullable().optional(),
						description: z.string().nullable().optional(), // Human-readable effect description
					})
					.passthrough(),
			)
			.nullable()
			.optional(),
	})
	.passthrough();

export type OSRSPotion = z.infer<typeof OSRSPotionSchema>;

// ============================================================================
// Food — proto: OSRSFood
// ============================================================================

export const OSRSFoodSchema = z
	.object({
		heals: z.number().nullable().optional(),
		heals_formula: z.string().nullable().optional(),
		overheal: z.boolean().nullable().optional(),
		cooking_level: z.number().min(1).max(99).nullable().optional(),
		cooking_xp: z.number().nullable().optional(), // MDX-only
		burn_level: z.number().nullable().optional(), // MDX-only

		// Classification
		type: z.string().nullable().optional(), // e.g., "fish", "pie", "cake"
		combo_food: z.boolean().nullable().optional(), // Can be eaten same tick as other food
	})
	.passthrough();

export type OSRSFood = z.infer<typeof OSRSFoodSchema>;

// ============================================================================
// Cooking — proto: OSRSCooking, OSRSCookingBurnRate
// ============================================================================

export const OSRSCookingSchema = z
	.object({
		level: z.number().min(0).max(99).nullable().optional(), // proto: cooking_level
		xp: z.number().nullable().optional(), // proto: cooking_xp
		stop_burn_level: z.number().nullable().optional(),
		stop_burn_level_gauntlets: z.number().nullable().optional(),
		stop_burn_level_hosidius: z.number().nullable().optional(),
		burn_rates: z
			.array(
				z
					.object({
						level: z.number().nullable().optional(),
						fire_rate: z.number().nullable().optional(), // proto: fire_success
						range_rate: z.number().nullable().optional(), // proto: range_success
						gauntlets_rate: z.number().nullable().optional(), // proto: gauntlets_success
					})
					.passthrough(),
			)
			.nullable()
			.optional(),
		raw_item_id: z.number().nullable().optional(),
		raw_item_name: z.string().nullable().optional(),
		ticks: z.number().nullable().optional(),
		burnt_item_id: z.number().nullable().optional(),

		// Quest requirement
		quest_required: z.string().nullable().optional(), // Quest needed to cook
	})
	.passthrough();

export type OSRSCooking = z.infer<typeof OSRSCookingSchema>;

// ============================================================================
// Treasure Trails — proto: OSRSTreasureTrail
// ============================================================================

export const OSRSTreasureTrailSchema = z.object({
	tier: z.enum(['beginner', 'easy', 'medium', 'hard', 'elite', 'master']),
	emotes: z.array(z.string()).optional(),
	stash_location: z.string().optional(),
	required_items: z.array(z.string()).optional(),
	is_reward: z.boolean().optional(),
	reward_tiers: z
		.array(
			z.enum(['beginner', 'easy', 'medium', 'hard', 'elite', 'master']),
		)
		.optional(),
});

export type OSRSTreasureTrail = z.infer<typeof OSRSTreasureTrailSchema>;

// ============================================================================
// Related Items — proto: OSRSRelatedItem
// ============================================================================

export const OSRSRelatedItemSchema = z.object({
	item_id: z.number().optional(),
	item_name: z.string().optional(),
	slug: z.string().optional(),
	relationship: z
		.enum([
			'variant',
			'upgrade',
			'downgrade',
			'component',
			'product',
			'set-piece',
			'alternative',
		])
		.optional(),
	description: z.string().optional(), // MDX-only
});

export type OSRSRelatedItem = z.infer<typeof OSRSRelatedItemSchema>;

// ============================================================================
// Price — proto: OSRSPrice
// ============================================================================

export const OSRSPriceSchema = z.object({
	high_price: z.number().nullable().optional(),
	high_time: z.number().nullable().optional(),
	low_price: z.number().nullable().optional(),
	low_time: z.number().nullable().optional(),
});

export type OSRSPrice = z.infer<typeof OSRSPriceSchema>;

// ============================================================================
// About / Content Text — proto: OSRSAbout
// ============================================================================

export const OSRSAboutSchema = z.object({
	text: z.string(),
});

export type OSRSAbout = z.infer<typeof OSRSAboutSchema>;

// ============================================================================
// Market Strategy — proto: OSRSMarketStrategy, OSRSMarketStep
// ============================================================================

export const OSRSMarketStepSchema = z.object({
	order: z.number().min(1),
	action: z.string(),
	item_id: z.number().nullable().optional(),
	item_name: z.string().nullable().optional(),
	item_slug: z.string().nullable().optional(), // MDX-only: for internal linking
});

export type OSRSMarketStep = z.infer<typeof OSRSMarketStepSchema>;

export const OSRSMarketStrategySchema = z.object({
	title: z.string().optional(),
	steps: z.array(OSRSMarketStepSchema).optional(),
	profit_formulas: z.array(z.string()).optional(),
	notes: z.array(z.string()).optional(),
});

export type OSRSMarketStrategy = z.infer<typeof OSRSMarketStrategySchema>;

// ============================================================================
// Item Material Classification — proto: OSRSMaterial
// (distinct from OSRSMaterialSchema which maps to proto OSRSRecipeMaterial)
// ============================================================================

export const OSRSItemMaterialSchema = z.object({
	type: z.string(), // e.g., "log", "ore", "bone", "hide", "gem", "herb"
	tier: z.string().optional(), // e.g., "low", "mid", "mid-high", "high"
});

export type OSRSItemMaterial = z.infer<typeof OSRSItemMaterialSchema>;

// ============================================================================
// Prayer Training — proto: OSRSPrayer
// ============================================================================

export const OSRSPrayerSchema = z
	.object({
		xp_bury: z.number().optional(),
		xp_gilded_altar: z.number().optional(),
		xp_gilded: z.number().optional(), // MDX alias
		xp_chaos_altar: z.number().optional(),
		xp_chaos: z.number().optional(), // MDX alias
		xp_ectofuntus: z.number().optional(),
	})
	.passthrough();

export type OSRSPrayer = z.infer<typeof OSRSPrayerSchema>;

// ============================================================================
// Gathering Skills — proto: OSRSGathering
// ============================================================================

export const OSRSGatheringSchema = z
	.object({
		skill: lowercaseSkill, // proto: OSRSSkill enum — inferred from context in MDX aliases
		level: z.number().min(1).max(99),
		xp: z.number().optional(),
		locations: z.array(z.string()).optional(),
		tool: z.string().optional(),
		members_only: z.boolean().optional(),
	})
	.passthrough();

export type OSRSGathering = z.infer<typeof OSRSGatheringSchema>;

// ============================================================================
// Teleportation — proto: OSRSTeleportDestination, OSRSTeleport
// ============================================================================

export const OSRSTeleportDestinationSchema = z.object({
	name: z.string(),
	location: z.string().optional(),
	requirements: z.string().optional(),
	members_only: z.boolean().optional(),
	wilderness: z.boolean().optional(),
});

export type OSRSTeleportDestination = z.infer<
	typeof OSRSTeleportDestinationSchema
>;

export const OSRSTeleportSchema = z
	.object({
		destinations: z.array(OSRSTeleportDestinationSchema).optional(),
		charges: z.number().optional(), // 0 = unlimited
		recharge_method: z.string().optional(),
		recharge_cost: z.number().optional(),
		type: z.string().optional(), // "jewelry", "tablet", "scroll", "spell", "other"
		spellbook: z.string().optional(), // "standard", "ancient", "lunar", "arceuus"
		magic_level: z.number().optional(),
		runes: z.array(z.string()).optional(), // e.g., ["1 Law rune", "3 Air rune"]
		magic_xp: z.number().optional(),
	})
	.passthrough();

export type OSRSTeleport = z.infer<typeof OSRSTeleportSchema>;

// ============================================================================
// Quest Involvement — proto: OSRSQuestRequirement, OSRSQuestData
// ============================================================================

export const OSRSQuestRequirementSchema = z.object({
	quest_name: z.string(),
	role: z.string().optional(), // "required", "reward", "optional", "starts"
	quantity: z.number().optional(),
	notes: z.string().optional(),
});

export type OSRSQuestRequirement = z.infer<typeof OSRSQuestRequirementSchema>;

export const OSRSQuestDataSchema = z.object({
	quests: z.array(OSRSQuestRequirementSchema).optional(),
});

export type OSRSQuestData = z.infer<typeof OSRSQuestDataSchema>;

// ============================================================================
// Farming — proto: OSRSFarming
// ============================================================================

export const OSRSFarmingSchema = z
	.object({
		farming_level: z.number().min(1).max(99).optional(),
		plant_xp: z.number().optional(),
		harvest_xp: z.number().optional(),
		check_health_xp: z.number().optional(),
		patch_type: z.string().optional(), // "allotment", "herb", "tree", etc.
		growth_time: z.number().optional(), // Minutes
		payment: z.string().optional(), // e.g., "1 basket of apples"
		payment_item_id: z.number().optional(),
		seed_id: z.number().optional(),
		produce_id: z.number().optional(),
		produce_name: z.string().optional(),
		min_yield: z.number().optional(),
		max_yield: z.number().optional(),
		compost_type: z.string().optional(), // "compost", "supercompost", "ultracompost"
		growth_cycles: z.number().optional(),
		cycle_minutes: z.number().optional(),
		seed_name: z.string().optional(),
		disease_free: z.boolean().optional(),
	})
	.passthrough();

export type OSRSFarming = z.infer<typeof OSRSFarmingSchema>;

// ============================================================================
// Charges & Degradation — proto: OSRSCharges
// ============================================================================

export const OSRSChargesSchema = z
	.object({
		max_charges: z.number().optional(),
		charge_cost_item_id: z.number().optional(),
		charge_cost_item: z.string().optional(),
		charges_per_item: z.number().optional(),
		degrade_to_id: z.number().optional(),
		degrade_to_name: z.string().optional(),
		repairable: z.boolean().optional(),
		repair_cost: z.number().optional(),
		repair_npc: z.string().optional(),
		combat_hours: z.number().optional(),
	})
	.passthrough();

export type OSRSCharges = z.infer<typeof OSRSChargesSchema>;

// ============================================================================
// Slayer — proto: OSRSSlayer
// ============================================================================

export const OSRSSlayerSchema = z
	.object({
		slayer_level: z.number().min(1).max(99).optional(),
		slayer_master: z.string().optional(),
		task_weight: z.number().optional(),
		category: z.string().optional(), // e.g., "abyssal demons", "gargoyles"
		requires_task: z.boolean().optional(),
	})
	.passthrough();

export type OSRSSlayer = z.infer<typeof OSRSSlayerSchema>;

// ============================================================================
// Construction / POH — proto: OSRSConstruction
// ============================================================================

export const OSRSConstructionSchema = z
	.object({
		construction_level: z.number().min(1).max(99).optional(),
		construction_xp: z.number().optional(),
		room: z.string().optional(),
		hotspot: z.string().optional(),
		flatpack: z.boolean().optional(),
		built_item_id: z.number().optional(),
	})
	.passthrough();

export type OSRSConstruction = z.infer<typeof OSRSConstructionSchema>;

// ============================================================================
// Passive / Special Effects — proto: OSRSPassiveEffect
// ============================================================================

export const OSRSPassiveEffectSchema = z
	.object({
		name: z.string(),
		description: z.string().optional(),
		trigger: z.string().optional(), // "always", "on_hit", "on_kill", "while_worn", "chance"
		chance: z.number().optional(), // 0.0-1.0
		affected_skill: lowercaseSkill, // proto: OSRSSkill enum
		boost_value: z.number().optional(),
		boost_formula: z.string().optional(),
	})
	.passthrough();

export type OSRSPassiveEffect = z.infer<typeof OSRSPassiveEffectSchema>;

// ============================================================================
// Ammunition — proto: OSRSAmmunition
// ============================================================================

export const OSRSAmmunitionSchema = z
	.object({
		type: z.string().optional(), // "arrow", "bolt", "dart", etc.
		tier: z.string().optional(), // "bronze", "iron", "steel", etc.
		ranged_strength: z.number().optional(),
		enchanted: z.boolean().optional(),
		enchant_effect: z.string().optional(),
		enchant_description: z.string().optional(),
		proc_rate_pvm: z.number().optional(), // 0.0-1.0
		proc_rate_pvp: z.number().optional(), // 0.0-1.0
		compatible_weapons: z.array(z.string()).optional(),
		enchant_magic_level: z.number().optional(),
		enchant_runes: z.array(z.string()).optional(),
	})
	.passthrough();

export type OSRSAmmunition = z.infer<typeof OSRSAmmunitionSchema>;

// ============================================================================
// Complete OSRS Item — proto: OSRSItem
// ============================================================================

export const OSRSExtendedSchema = z.object({
	// Base fields — proto: id, name, slug, examine, members, icon, value
	id: z.number(),
	name: z.string(),
	slug: z.string(),
	examine: z.string(),
	members: z.boolean(),
	icon: z.string(),
	value: z.number(),
	lowalch: z.number().nullable(),
	highalch: z.number().nullable(),
	limit: z.number().nullable(), // proto: ge_limit

	// SEO / Meta
	meta: OSRSMetaSchema.optional(),

	// Item properties
	properties: OSRSItemPropertiesSchema.optional(),

	// Equipment (weapons + armor) — proto: equipment, special_attack, set_bonus
	equipment: OSRSEquipmentSchema.optional(),
	special_attack: OSRSSpecialAttackSchema.optional(),
	set_bonus: OSRSSetBonusSchema.optional(),

	// Consumable data — proto: consumable (→ potion), food, cooking
	potion: OSRSPotionSchema.optional(), // proto field: consumable
	food: OSRSFoodSchema.optional(),
	cooking: OSRSCookingSchema.optional(),

	// Sources — proto: drop_sources (→ drop_table), shops, skilling_source
	drop_table: OSRSDropTableSchema.optional(), // proto field: drop_sources
	shops: z.array(OSRSShopSourceSchema).optional(),
	skilling_source: OSRSSkillingSourceSchema.optional(),

	// Creation — proto: recipes
	recipes: z.array(OSRSRecipeSchema).optional(),

	// Treasure trails — proto: treasure_trail
	treasure_trail: OSRSTreasureTrailSchema.optional(),

	// Related items — proto: related_items
	related_items: z.array(OSRSRelatedItemSchema).optional(),

	// Price (runtime data, not typically in frontmatter)
	price: OSRSPriceSchema.optional(),

	// ── New fields (proto fields 26-39) ──

	// Content text — proto: about (field 26)
	about: z.union([z.string(), OSRSAboutSchema]).optional(),

	// Market / trading — proto: market_strategy (27), trading_tips (28)
	market_strategy: OSRSMarketStrategySchema.optional(),
	trading_tips: z.array(z.string()).optional(),

	// Material classification — proto: material (29)
	material: OSRSItemMaterialSchema.optional(),

	// Prayer training — proto: prayer (30)
	prayer: OSRSPrayerSchema.optional(),

	// Gathering skills — proto: gathering (31)
	// MDX uses skill-specific keys that map to gathering with implicit skill
	gathering: OSRSGatheringSchema.optional(),
	woodcutting: OSRSGatheringSchema.optional(), // MDX alias → gathering(woodcutting)
	mining: OSRSGatheringSchema.optional(), // MDX alias → gathering(mining)
	fishing: OSRSGatheringSchema.optional(), // MDX alias → gathering(fishing)

	// Teleportation — proto: teleport (32)
	teleport: OSRSTeleportSchema.optional(),

	// Quest involvement — proto: quest_data (33)
	quest_data: OSRSQuestDataSchema.optional(),

	// Farming — proto: farming (34)
	farming: OSRSFarmingSchema.optional(),

	// Charges & degradation — proto: charges (35)
	charges: OSRSChargesSchema.optional(),

	// Slayer — proto: slayer (36)
	slayer: OSRSSlayerSchema.optional(),

	// Construction / POH — proto: construction (37)
	construction: OSRSConstructionSchema.optional(),

	// Passive effects — proto: passive_effects (38)
	passive_effects: z.array(OSRSPassiveEffectSchema).optional(),

	// Ammunition — proto: ammunition (39)
	ammunition: OSRSAmmunitionSchema.optional(),
});

export type OSRSExtended = z.infer<typeof OSRSExtendedSchema>;

// ============================================================================
// Type Guards
// ============================================================================

// ── Existing guards ──

export function hasEquipment(
	item: OSRSExtended,
): item is OSRSExtended & { equipment: OSRSEquipment } {
	return item.equipment !== undefined;
}

export function isWeapon(item: OSRSExtended): boolean {
	return item.equipment?.slot === 'weapon' || item.equipment?.slot === '2h';
}

export function hasSpecialAttack(
	item: OSRSExtended,
): item is OSRSExtended & { special_attack: OSRSSpecialAttack } {
	return item.special_attack !== undefined;
}

export function hasSetBonus(
	item: OSRSExtended,
): item is OSRSExtended & { set_bonus: OSRSSetBonus } {
	return item.set_bonus !== undefined;
}

export function isPotion(
	item: OSRSExtended,
): item is OSRSExtended & { potion: OSRSPotion } {
	return item.potion !== undefined;
}

export function isFood(
	item: OSRSExtended,
): item is OSRSExtended & { food: OSRSFood } {
	return item.food !== undefined;
}

export function hasCooking(
	item: OSRSExtended,
): item is OSRSExtended & { cooking: OSRSCooking } {
	return item.cooking !== undefined;
}

export function hasDropSources(
	item: OSRSExtended,
): item is OSRSExtended & { drop_table: OSRSDropTable } {
	if (item.drop_table === undefined) return false;
	if (Array.isArray(item.drop_table)) {
		return item.drop_table.length > 0;
	}
	return (item.drop_table.sources?.length ?? 0) > 0;
}

export function hasShopSources(item: OSRSExtended): boolean {
	return (item.shops?.length ?? 0) > 0;
}

export function hasRecipes(item: OSRSExtended): boolean {
	return (item.recipes?.length ?? 0) > 0;
}

export function isTreasureTrailItem(
	item: OSRSExtended,
): item is OSRSExtended & { treasure_trail: OSRSTreasureTrail } {
	return item.treasure_trail !== undefined;
}

export function hasMeta(
	item: OSRSExtended,
): item is OSRSExtended & { meta: OSRSMeta } {
	return item.meta !== undefined;
}

export function hasProperties(
	item: OSRSExtended,
): item is OSRSExtended & { properties: OSRSItemProperties } {
	return item.properties !== undefined;
}

export function isTradeable(item: OSRSExtended): boolean {
	return (
		item.properties?.tradeable === true ||
		item.properties?.tradeable_ge === true
	);
}

export function isQuestItem(item: OSRSExtended): boolean {
	return item.properties?.quest_item === true;
}

export function hasRelatedItems(item: OSRSExtended): boolean {
	return (item.related_items?.length ?? 0) > 0;
}

// ── New guards (proto fields 26-39) ──

export function hasAbout(
	item: OSRSExtended,
): item is OSRSExtended & { about: string | OSRSAbout } {
	if (item.about === undefined) return false;
	if (typeof item.about === 'string') return item.about.length > 0;
	return item.about.text.length > 0;
}

/** Normalize about to always return a string */
export function getAboutText(item: OSRSExtended): string | undefined {
	if (!item.about) return undefined;
	return typeof item.about === 'string' ? item.about : item.about.text;
}

export function hasMarketStrategy(
	item: OSRSExtended,
): item is OSRSExtended & { market_strategy: OSRSMarketStrategy } {
	return item.market_strategy !== undefined;
}

export function hasTradingTips(
	item: OSRSExtended,
): item is OSRSExtended & { trading_tips: string[] } {
	return (item.trading_tips?.length ?? 0) > 0;
}

export function hasMaterial(
	item: OSRSExtended,
): item is OSRSExtended & { material: OSRSItemMaterial } {
	return item.material !== undefined;
}

export function hasPrayer(
	item: OSRSExtended,
): item is OSRSExtended & { prayer: OSRSPrayer } {
	return item.prayer !== undefined;
}

/** Normalize prayer XP (handles both proto-style and MDX alias field names) */
export function getPrayerXP(prayer: OSRSPrayer): {
	xp_bury?: number;
	xp_gilded_altar?: number;
	xp_chaos_altar?: number;
	xp_ectofuntus?: number;
} {
	return {
		xp_bury: prayer.xp_bury,
		xp_gilded_altar: prayer.xp_gilded_altar ?? prayer.xp_gilded,
		xp_chaos_altar: prayer.xp_chaos_altar ?? prayer.xp_chaos,
		xp_ectofuntus: prayer.xp_ectofuntus,
	};
}

export function hasGathering(item: OSRSExtended): boolean {
	return (
		item.gathering !== undefined ||
		item.woodcutting !== undefined ||
		item.mining !== undefined ||
		item.fishing !== undefined
	);
}

/** Normalize gathering data from skill-specific MDX aliases */
export function getGathering(
	item: OSRSExtended,
): (OSRSGathering & { skill: string }) | undefined {
	if (item.gathering)
		return { skill: item.gathering.skill ?? 'unknown', ...item.gathering };
	if (item.woodcutting) return { ...item.woodcutting, skill: 'woodcutting' };
	if (item.mining) return { ...item.mining, skill: 'mining' };
	if (item.fishing) return { ...item.fishing, skill: 'fishing' };
	return undefined;
}

export function hasTeleport(
	item: OSRSExtended,
): item is OSRSExtended & { teleport: OSRSTeleport } {
	return item.teleport !== undefined;
}

export function hasQuestData(
	item: OSRSExtended,
): item is OSRSExtended & { quest_data: OSRSQuestData } {
	return item.quest_data !== undefined;
}

export function hasFarming(
	item: OSRSExtended,
): item is OSRSExtended & { farming: OSRSFarming } {
	return item.farming !== undefined;
}

export function hasCharges(
	item: OSRSExtended,
): item is OSRSExtended & { charges: OSRSCharges } {
	return item.charges !== undefined;
}

export function hasSlayer(
	item: OSRSExtended,
): item is OSRSExtended & { slayer: OSRSSlayer } {
	return item.slayer !== undefined;
}

export function hasConstruction(
	item: OSRSExtended,
): item is OSRSExtended & { construction: OSRSConstruction } {
	return item.construction !== undefined;
}

export function hasPassiveEffects(item: OSRSExtended): boolean {
	return (item.passive_effects?.length ?? 0) > 0;
}

export function hasAmmunition(
	item: OSRSExtended,
): item is OSRSExtended & { ammunition: OSRSAmmunition } {
	return item.ammunition !== undefined;
}

// ── Meta description generator ──

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

	const description = parts.join(' ');
	return description.length > 160
		? description.substring(0, 157) + '...'
		: description;
}
