import { z } from 'astro/zod';

export const MCRarities = ['common', 'uncommon', 'rare', 'epic'] as const;
export const MCRaritySchema = z.enum(MCRarities);
export type MCRarity = z.infer<typeof MCRaritySchema>;

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

export const MCToolTiers = [
	'wooden',
	'stone',
	'golden',
	'iron',
	'diamond',
	'netherite',
	'leather',
	'chainmail',
	'turtle',
] as const;
export const MCToolTierSchema = z.enum(MCToolTiers);
export type MCToolTier = z.infer<typeof MCToolTierSchema>;

export const MCEnchantRarities = [
	'common',
	'uncommon',
	'rare',
	'very_rare',
] as const;
export const MCEnchantRaritySchema = z.enum(MCEnchantRarities);
export type MCEnchantRarity = z.infer<typeof MCEnchantRaritySchema>;

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

export const MCIdentitySchema = z.object({
	id: z.number().int().nonnegative(),
	ref: z
		.string()
		.min(1)
		.regex(
			/^(?:[a-z_]+:)?[a-z0-9_]+(?:\/[a-z0-9_]+)*$/,
			'ref must be lowercase snake_case, optionally prefixed by a namespace like "kbve:", "minecraft:" or "immersive_aircraft:"',
		),
	slug: z
		.string()
		.min(1)
		.regex(
			/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/,
			'slug must be kebab-case (slashes allowed)',
		),
	content_rev: z.number().int().nonnegative().default(0),
});
export type MCIdentity = z.infer<typeof MCIdentitySchema>;
