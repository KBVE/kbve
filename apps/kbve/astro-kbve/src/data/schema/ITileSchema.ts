/**
 * Astro content collection schema for tiledb entries (one MDX per tile).
 *
 * Game-logic core comes from the proto-generated TileAssetSchema
 * (packages/data/codegen/generated/mapdb-schema.ts). The semantic role enum
 * and the animation block are defined inline here (astro:content's z), since
 * nested schemas imported across the zod-package boundary get silently
 * stripped (project memory: schema-inline-engine).
 */
import { z } from 'astro/zod';
import { TileAssetSchema } from '../../../../../../packages/data/codegen/generated/mapdb-schema';

export { TileAssetSchema };
export type { TileAsset } from '../../../../../../packages/data/codegen/generated/mapdb-schema';

// TileRole — lowercase, TILE_ROLE_-stripped (mirrors the proto enum).
export const TileRoleEnum = z.enum([
	'unspecified',
	'ground',
	'plaza',
	'road',
	'grass',
	'wall',
	'roof',
	'door',
	'water',
	'prop',
	'prop_solid',
	'void',
]);

// Per-tile animation — a frame strip with per-frame durations.
export const ITileAnimationSchema = z.object({
	hasAnimation: z.boolean().default(false),
	spriteSheetPath: z.string().optional(),
	frameDurations: z.array(z.number().positive()).optional(),
	loop: z.boolean().default(true),
});

export const ITileSchema = TileAssetSchema.merge(
	z.object({
		role: TileRoleEnum,
		animation: ITileAnimationSchema.optional(),
	}),
).passthrough();

export type ITile = z.infer<typeof ITileSchema>;
export type ITileAnimation = z.infer<typeof ITileAnimationSchema>;
