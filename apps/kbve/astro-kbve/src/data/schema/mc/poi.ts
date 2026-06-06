import { z } from 'astro/zod';

export const MCPoiKindSchema = z.enum([
	'spawn',
	'marketplace',
	'portal',
	'monument',
	'biome',
	'shop',
	'guild',
	'admin',
	'landmark',
]);
export type MCPoiKind = z.infer<typeof MCPoiKindSchema>;

export const MCPoiFrontmatterSchema = z.object({
	poi_id: z.string().min(3).max(96),
	display_name: z.string().min(1),
	kind: MCPoiKindSchema,
	world: z
		.string()
		.regex(/^[a-z0-9_.-]+:[a-z0-9_/.-]+$/)
		.default('minecraft:overworld'),
	chunk_x: z.number().int(),
	chunk_z: z.number().int(),
	radius_chunks: z.number().int().nonnegative().default(0),
	anchor_y: z.number().int().min(-64).max(319).optional(),
	icon: z.string().default(''),
	about: z
		.object({
			summary: z.string().default(''),
			notes: z.string().default(''),
		})
		.default({ summary: '', notes: '' }),
});
export type MCPoiFrontmatter = z.infer<typeof MCPoiFrontmatterSchema>;
