/**
 * Proto-aligned MC enum tables.
 *
 * Each `as const` array mirrors a proto enum in packages/data/proto/kbve/mc/.
 * Stored on the MDX side as lowercase strings (we strip the proto prefix and
 * lowercase the suffix — e.g. `MC_RARITY_COMMON` → `"common"`). Zod uses
 * z.enum on these arrays so frontmatter validation rejects unknown values.
 */

import { z } from 'astro/zod';

// proto: MCRarity
export const MCRarities = ['common', 'uncommon', 'rare', 'epic'] as const;
export const MCRaritySchema = z.enum(MCRarities);
export type MCRarity = z.infer<typeof MCRaritySchema>;

// proto: MCItemCategory
export const MCItemCategories = [
	'tool',
	'weapon',
	'armor',
	'food',
	'block',
	'material',
	'redstone',
	'transport',
	'decoration',
	'brewing',
	'spawn_egg',
	'music',
	'banner',
	'map',
	'misc',
] as const;
export const MCItemCategorySchema = z.enum(MCItemCategories);
export type MCItemCategory = z.infer<typeof MCItemCategorySchema>;

// proto: MCToolTier
export const MCToolTiers = [
	'wooden',
	'stone',
	'golden',
	'iron',
	'diamond',
	'netherite',
] as const;
export const MCToolTierSchema = z.enum(MCToolTiers);
export type MCToolTier = z.infer<typeof MCToolTierSchema>;

// proto: MCEnchantRarity
export const MCEnchantRarities = [
	'common',
	'uncommon',
	'rare',
	'very_rare',
] as const;
export const MCEnchantRaritySchema = z.enum(MCEnchantRarities);
export type MCEnchantRarity = z.infer<typeof MCEnchantRaritySchema>;

// proto: MCEnchantTarget
export const MCEnchantTargets = [
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
] as const;
export const MCEnchantTargetSchema = z.enum(MCEnchantTargets);
export type MCEnchantTarget = z.infer<typeof MCEnchantTargetSchema>;

// proto: McBlockTool
export const McBlockTools = [
	'hand',
	'pickaxe',
	'axe',
	'shovel',
	'hoe',
	'shears',
	'sword',
] as const;
export const McBlockToolSchema = z.enum(McBlockTools);
export type McBlockTool = z.infer<typeof McBlockToolSchema>;

// proto: McBlockMaterial
export const McBlockMaterials = [
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
] as const;
export const McBlockMaterialSchema = z.enum(McBlockMaterials);
export type McBlockMaterial = z.infer<typeof McBlockMaterialSchema>;

// proto: McRecipeKind
export const McRecipeKinds = [
	'shaped',
	'shapeless',
	'smelting',
	'blasting',
	'smoking',
	'campfire_cooking',
	'stonecutting',
	'smithing',
	'brewing',
	'trade',
] as const;
export const McRecipeKindSchema = z.enum(McRecipeKinds);
export type McRecipeKind = z.infer<typeof McRecipeKindSchema>;

// proto: McCraftingStation
export const McCraftingStations = [
	'crafting_table',
	'furnace',
	'blast_furnace',
	'smoker',
	'campfire',
	'stonecutter',
	'smithing_table',
	'brewing_stand',
	'villager',
	'none',
] as const;
export const McCraftingStationSchema = z.enum(McCraftingStations);
export type McCraftingStation = z.infer<typeof McCraftingStationSchema>;

/**
 * Shared identity fields. Every top-level MC record (item, enchant, block,
 * recipe) carries an int id, a stable string ref, and a kebab-case slug.
 */
export const MCIdentitySchema = z.object({
	id: z.number().int().nonnegative(),
	ref: z
		.string()
		.min(1)
		.regex(
			/^[a-z0-9_]+(?:\/[a-z0-9_]+)*$/,
			'ref must be lowercase snake_case (slashes allowed for recipe namespaces)',
		),
	slug: z
		.string()
		.min(1)
		.regex(/^[a-z0-9-]+$/, 'slug must be kebab-case'),
});
export type MCIdentity = z.infer<typeof MCIdentitySchema>;
