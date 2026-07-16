import { z } from 'astro/zod';
import {
	MCIdentitySchema,
	McBlockMaterialSchema,
	McBlockToolSchema,
} from './enums';
import { MCAboutSchema } from './items';

export const McBlockDropSchema = z.object({
	ref: z.string().min(1),
	qty_min: z.number().int().nonnegative().default(1),
	qty_max: z.number().int().positive().default(1),
	silk_touch_only: z.boolean().default(false),
	affected_by_fortune: z.boolean().default(false),
});
export type McBlockDrop = z.infer<typeof McBlockDropSchema>;

export const McBlockUseSchema = z.object({
	title: z.string().min(1),
	detail: z.string().default(''),
	ref: z.string().default(''),
});
export type McBlockUse = z.infer<typeof McBlockUseSchema>;

export const McBlockFoundSchema = z.object({
	location: z.string().min(1),
	detail: z.string().default(''),
});
export type McBlockFound = z.infer<typeof McBlockFoundSchema>;

export const McBlockFaqSchema = z.object({
	question: z.string().min(1),
	answer: z.string().min(1),
});
export type McBlockFaq = z.infer<typeof McBlockFaqSchema>;

export const McBlockSchema = MCIdentitySchema.extend({
	display_name: z.string().min(1),
	material: McBlockMaterialSchema,

	hardness: z.number(),
	blast_resistance: z.number().nonnegative(),

	best_tool: McBlockToolSchema.default('hand'),
	required_tool_tier: z.number().int().min(0).max(6).default(0),

	light_emission: z.number().int().min(0).max(15).default(0),
	light_opacity: z.number().int().min(0).max(15).default(15),

	transparent: z.boolean().default(false),
	placeable: z.boolean().default(true),
	solid: z.boolean().default(true),
	renewable: z.boolean().default(false),
	diggable: z.boolean().default(true),

	drops: z.array(McBlockDropSchema).default([]),
	tags: z.array(z.string().min(1)).default([]),

	about: MCAboutSchema.default({ description: '', lore: '' }),
	uses: z.array(McBlockUseSchema).default([]),
	found_in: z.array(McBlockFoundSchema).default([]),
	faq: z.array(McBlockFaqSchema).default([]),

	data_version: z.string().default(''),
});
export type McBlock = z.infer<typeof McBlockSchema>;
