/**
 * Astro content collection schema for mapdb entries.
 *
 * Game-logic fields come from the proto-generated WorldObjectDefSchema
 * (packages/data/codegen/generated/mapdb-schema.ts).
 * Astro-specific rendering fields are layered on top.
 */
import { z } from 'astro:content';
import {
	WorldObjectDefSchema,
	WorldObjectTypeSchema,
	BuildCostSchema,
} from '../../../../../../packages/data/codegen/generated/mapdb-schema';

// Re-export generated types for downstream consumers
export { WorldObjectTypeSchema, BuildCostSchema };
export type {
	WorldObjectDef,
	WorldObjectTypeValue,
	BuildCost,
} from '../../../../../../packages/data/codegen/generated/mapdb-schema';

// ---------------------------------------------------------------------------
// Astro-specific rendering enums
// ---------------------------------------------------------------------------

export const SpriteMeshTypeEnum = z.enum(['FullRect', 'Tight']);

export const PivotAlignmentEnum = z.enum([
	'Center',
	'TopLeft',
	'Top',
	'TopRight',
	'Left',
	'Right',
	'BottomLeft',
	'Bottom',
	'BottomRight',
	'Custom',
]);

export const TextureWrapModeEnum = z.enum([
	'Clamp',
	'Repeat',
	'Mirror',
	'MirrorOnce',
]);

// ---------------------------------------------------------------------------
// Animation sub-schemas (Astro / Unity rendering)
// ---------------------------------------------------------------------------

export const ISpriteAnimationFrameSchema = z.object({
	x: z.number().int().nonnegative(),
	y: z.number().int().nonnegative(),
});

export const IAnimationFrameRangeSchema = z.object({
	offset: z.number().int().nonnegative().default(0),
	count: z.number().int().positive(),
});

export const IAnimationClipSchema = z.object({
	id: z.string(),
	name: z.string().optional(),
	frameCount: ISpriteAnimationFrameSchema,
	frameRange: IAnimationFrameRangeSchema,
	frameDurations: z.array(z.number().positive()),
	loop: z.boolean().default(true),
	playOnStart: z.boolean().default(false),
	priority: z.number().int().nonnegative().default(0),
});

export const IAnimationDataSchema = z.object({
	hasAnimation: z.boolean().default(false),
	spriteSheetPath: z.string().optional(),
	clips: z.array(IAnimationClipSchema).optional(),
	defaultClip: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Astro rendering extension — layered on top of proto WorldObjectDefSchema
// ---------------------------------------------------------------------------

const AstroRenderingFields = z.object({
	pixels_per_unit: z.number().int().positive().default(16),
	pivot: PivotAlignmentEnum.default('Center'),
	pivot_x: z.number().min(0).max(1).default(0.5),
	pivot_y: z.number().min(0).max(1).default(0.5),
	mesh_type: SpriteMeshTypeEnum.default('FullRect'),
	extrude_edges: z.number().int().min(0).max(32).default(1),
	sorting_layer: z.string().default('Foreground'),
	sorting_index: z.number().int().default(0),
	static_sorting: z.boolean().default(true),
	wrap_mode: TextureWrapModeEnum.default('Clamp'),
	animation: IAnimationDataSchema.optional(),
});

// ---------------------------------------------------------------------------
// Combined schema — proto source of truth + Astro rendering layer
// ---------------------------------------------------------------------------

export const IMapObjectSchema =
	WorldObjectDefSchema.merge(AstroRenderingFields).passthrough();

export type IMapObject = z.infer<typeof IMapObjectSchema>;

// ---------------------------------------------------------------------------
// Convenience type aliases
// ---------------------------------------------------------------------------

export type IAnimationData = z.infer<typeof IAnimationDataSchema>;
export type IAnimationClip = z.infer<typeof IAnimationClipSchema>;
