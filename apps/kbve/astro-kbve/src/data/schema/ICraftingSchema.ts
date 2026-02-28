import { z } from 'astro:content';
import { ULID } from '@/data/types';

const ICraftingIngredient = z.union([
	z.string(),
	z.object({
		name: z.string().optional(),
		ref: ULID,
		amount: z.number().int().positive().default(1),
	}),
]);

const ICraftingTool = z.union([
	z.string(),
	z.object({
		name: z.string().optional(),
		ref: ULID,
	}),
]);

export const ICraftingSchema = z.object({
	ingredients: z.array(ICraftingIngredient).optional(),
	tools: z.array(ICraftingTool).optional(),
});
