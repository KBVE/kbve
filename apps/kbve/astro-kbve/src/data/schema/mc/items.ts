import { z } from 'astro/zod';
import {
	MCIdentitySchema,
	MCItemCategorySchema,
	MCRaritySchema,
	MCToolTierSchema,
	McCraftingStationSchema,
	McRecipeKindSchema,
} from './enums';

export const MCEquipmentSchema = z.object({
	slot: z.enum(['head', 'chest', 'legs', 'feet', 'offhand', '']).default(''),
	armor_points: z.number().int().nonnegative().default(0),
	toughness: z.number().int().nonnegative().default(0),
	knockback_resistance: z.number().int().nonnegative().default(0),
});
export type MCEquipment = z.infer<typeof MCEquipmentSchema>;

export const MCDamageSchema = z.object({
	attack_damage: z.number().nonnegative(),
	attack_speed: z.number(),
});
export type MCDamage = z.infer<typeof MCDamageSchema>;

export const MCFoodSchema = z.object({
	nutrition: z.number().int().nonnegative(),
	saturation: z.number().nonnegative(),
	eatable: z.enum(['always', 'when_hungry', '']).default('when_hungry'),
});
export type MCFood = z.infer<typeof MCFoodSchema>;

export const MCMiningProfileSchema = z.object({
	tool_type: z.enum(['pickaxe', 'axe', 'shovel', 'hoe', 'shears', 'sword']),
	tier: z.number().int().min(1).max(6),
});
export type MCMiningProfile = z.infer<typeof MCMiningProfileSchema>;

export const MCEnchantCompatSchema = z.object({
	allowed: z.array(z.string().min(1)).default([]),
});
export type MCEnchantCompat = z.infer<typeof MCEnchantCompatSchema>;

export const MCItemRecipeIngredientSchema = z
	.object({
		ref: z.string().default(''),
		tag_ref: z.string().default(''),
		qty: z.number().int().positive().default(1),
		row: z.number().int().min(0).max(2).default(0),
		col: z.number().int().min(0).max(2).default(0),
	})
	.refine((v) => v.ref.length > 0 || v.tag_ref.length > 0, {
		message: 'ingredient must set ref or tag_ref',
	});

export const MCItemRecipeSchema = z.object({
	kind: McRecipeKindSchema,
	station: McCraftingStationSchema.default('none'),
	yields: z.number().int().positive().default(1),
	ingredients: z.array(MCItemRecipeIngredientSchema).default([]),
	width: z.number().int().min(0).max(3).default(0),
	height: z.number().int().min(0).max(3).default(0),
	cook_time_ticks: z.number().int().nonnegative().default(0),
	experience: z.number().nonnegative().default(0),
	smithing_template_ref: z.string().default(''),
	brewing_base_ref: z.string().default(''),
});
export type MCItemRecipe = z.infer<typeof MCItemRecipeSchema>;

export const MCAboutSchema = z.object({
	description: z.string().default(''),
	lore: z.string().default(''),
});
export type MCAbout = z.infer<typeof MCAboutSchema>;

export const MCItemSchema = MCIdentitySchema.extend({
	display_name: z.string().min(1),
	category: MCItemCategorySchema,
	rarity: MCRaritySchema.default('common'),
	stack_size: z.number().int().positive().default(64),
	max_durability: z.number().int().nonnegative().default(0),

	equipment: MCEquipmentSchema.optional(),
	damage: MCDamageSchema.optional(),
	food: MCFoodSchema.optional(),
	mining: MCMiningProfileSchema.optional(),
	enchants: MCEnchantCompatSchema.optional(),
	tier: MCToolTierSchema.optional(),

	tags: z.array(z.string().min(1)).default([]),
	recipes: z.array(MCItemRecipeSchema).default([]),
	drop_sources: z.array(z.string().min(1)).default([]),

	about: MCAboutSchema.default({ description: '', lore: '' }),

	data_version: z.string().default(''),
	icon: z.string().default(''),
});
export type MCItem = z.infer<typeof MCItemSchema>;
