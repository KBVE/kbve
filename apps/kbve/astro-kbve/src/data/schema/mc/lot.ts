import { z } from 'astro/zod';

export const MCLotFrontmatterSchema = z.object({
	lot_id: z.string().min(3).max(96),
	world: z.string().regex(/^[a-z0-9_.-]+:[a-z0-9_/.-]+$/),
	chunk_x_min: z.number().int(),
	chunk_x_max: z.number().int(),
	chunk_z_min: z.number().int(),
	chunk_z_max: z.number().int(),
	anchor_y: z.number().int().min(-64).max(319),
	price_credits: z.number().int().nonnegative().default(0),
	price_khash: z.number().int().nonnegative().default(0),
	state: z
		.enum(['vacant', 'owned', 'built', 'under_build', 'demolishing'])
		.default('vacant'),
	current_schematic_id: z.string().optional(),
	about: z
		.object({
			summary: z.string().default(''),
			notes: z.string().default(''),
		})
		.default({ summary: '', notes: '' }),
});
export type MCLotFrontmatter = z.infer<typeof MCLotFrontmatterSchema>;
