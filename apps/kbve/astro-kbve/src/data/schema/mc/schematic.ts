import { z } from 'astro/zod';

export const MCSchematicCategorySchema = z.enum([
	'house',
	'castle',
	'tower',
	'farm',
	'shop',
	'utility',
	'monument',
]);
export type MCSchematicCategory = z.infer<typeof MCSchematicCategorySchema>;

export const MCSchematicFrontmatterSchema = z.object({
	schematic_id: z.string().min(3).max(128),
	display_name: z.string().min(1),
	category: MCSchematicCategorySchema,
	tier: z.number().int().min(1).max(10).default(1),
	dims_x: z.number().int().positive(),
	dims_y: z.number().int().positive().max(384),
	dims_z: z.number().int().positive(),
	price_credits: z.number().int().nonnegative().default(0),
	price_khash: z.number().int().nonnegative().default(0),
	resource_path: z
		.string()
		.regex(
			/^schematics\/[A-Za-z0-9_./-]+\.(nbt|schem)$/,
			'resource_path must look like schematics/<name>.nbt|schem',
		),
	enabled: z.boolean().default(true),
	tags: z.array(z.string().min(1)).default([]),
	about: z
		.object({
			summary: z.string().default(''),
			lore: z.string().default(''),
		})
		.default({ summary: '', lore: '' }),
});
export type MCSchematicFrontmatter = z.infer<
	typeof MCSchematicFrontmatterSchema
>;
