/**
 * Proto-aligned Zod schema for kbve.mc.McBlock.
 *
 * Mirrors packages/data/proto/kbve/mc/mc_blocks.proto. Validates frontmatter
 * for content/docs/mc/blocks/<slug>.mdx. Placeable blocks share `ref` with
 * the mc_items.proto MCItem of the same name (item form).
 */

import { z } from 'astro/zod';
import {
	MCIdentitySchema,
	McBlockMaterialSchema,
	McBlockToolSchema,
} from './enums';

// proto: McBlockDrop
export const McBlockDropSchema = z.object({
	ref: z.string().min(1),
	qty_min: z.number().int().nonnegative().default(1),
	qty_max: z.number().int().positive().default(1),
	silk_touch_only: z.boolean().default(false),
	affected_by_fortune: z.boolean().default(false),
});
export type McBlockDrop = z.infer<typeof McBlockDropSchema>;

/**
 * proto: McBlock — top-level block record.
 */
export const McBlockSchema = MCIdentitySchema.extend({
	display_name: z.string().min(1),
	material: McBlockMaterialSchema,

	// hardness can be -1 for indestructible blocks (bedrock); allow negatives.
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

	data_version: z.string().default(''),
});
export type McBlock = z.infer<typeof McBlockSchema>;
