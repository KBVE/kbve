import { z } from 'astro/zod';
import {
	MCEnchantRaritySchema,
	MCEnchantTargetSchema,
	MCIdentitySchema,
} from './enums';

export const MCEnchantCostRangeSchema = z.object({
	a_min: z.number().int(),
	b_min: z.number().int(),
	a_max: z.number().int(),
	b_max: z.number().int(),
});
export type MCEnchantCostRange = z.infer<typeof MCEnchantCostRangeSchema>;

export const McEnchantSchema = MCIdentitySchema.extend({
	display_name: z.string().min(1),
	rarity: MCEnchantRaritySchema,

	max_level: z.number().int().min(1).max(10),
	weight: z.number().int().positive(),

	treasure: z.boolean().default(false),
	curse: z.boolean().default(false),
	tradeable: z.boolean().default(true),
	discoverable: z.boolean().default(true),
	available_in_creative: z.boolean().default(true),

	targets: z.array(MCEnchantTargetSchema).default([]),
	incompatible_with: z.array(z.string().min(1)).default([]),

	anvil_cost: z.number().int().nonnegative().default(1),
	cost: MCEnchantCostRangeSchema.optional(),

	tags: z.array(z.string().min(1)).default([]),
	description: z.string().default(''),

	data_version: z.string().default(''),
});
export type McEnchant = z.infer<typeof McEnchantSchema>;
