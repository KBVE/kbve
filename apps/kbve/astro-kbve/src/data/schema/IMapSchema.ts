import { z } from 'astro:content';
import { ULID, GUID } from '@/data/types';

export const ResourceTypeEnum = z.enum([
	'none',
	'wood',
	'stone',
	'metal',
	'food',
]);
export const StructureTypeEnum = z.enum([
	'building',
	'wall',
	'tower',
	'decoration',
]);
export const MapObjectTypeEnum = z.enum(['resource', 'structure']);
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

const BaseMapObjectSchema = z.object({
	id: ULID,
	guid: GUID,
	drafted: z.boolean().optional().default(false),
	name: z.string(),
	description: z.string().optional(),
	imagePath: z.string(),
	pixelsPerUnit: z.number().int().positive().default(16),
	pivot: PivotAlignmentEnum.default('Center'),
	pivotX: z.number().min(0).max(1).default(0.5),
	pivotY: z.number().min(0).max(1).default(0.5),
	meshType: SpriteMeshTypeEnum.default('FullRect'),
	extrudeEdges: z.number().int().min(0).max(32).default(1),
	sortingLayer: z.string().default('Foreground'),
	sortingIndex: z.number().int().default(0),
	staticSorting: z.boolean().default(true),
	wrapMode: TextureWrapModeEnum.default('Clamp'),
	animation: IAnimationDataSchema.optional(),
});

export const IResourceSchema = BaseMapObjectSchema.extend({
	type: z.literal('resource'),
	resourceType: ResourceTypeEnum.default('wood'),
	amount: z.number().int().min(0).max(65535),
	maxAmount: z.number().int().min(0).max(65535),
	harvestYield: z.number().int().min(1).max(65535).default(1),
	harvestTime: z.number().min(0.1).default(2.0),
	isHarvestable: z.boolean().default(true),
	isDepleted: z.boolean().default(false),
	spawnWeight: z.number().min(0).max(1).default(1.0),
	spawnCount: z.number().int().nonnegative().optional(),
}).passthrough();

export const IStructureSchema = BaseMapObjectSchema.extend({
	type: z.literal('structure'),
	structureType: StructureTypeEnum.default('building'),
	footprintWidth: z.number().int().positive().default(1),
	footprintHeight: z.number().int().positive().default(1),
	isWalkable: z.boolean().default(false),
	blocksPlacement: z.boolean().default(true),
	maxHealth: z.number().int().positive().default(100),
	constructionTime: z.number().nonnegative().default(0),
	buildCosts: z
		.array(
			z.object({
				resourceType: ResourceTypeEnum,
				amount: z.number().int().positive(),
			}),
		)
		.optional(),
}).passthrough();

export const IMapObjectSchema = z.discriminatedUnion('type', [
	IResourceSchema,
	IStructureSchema,
]);

export type IMapObject = z.infer<typeof IMapObjectSchema>;
export type IResource = z.infer<typeof IResourceSchema>;
export type IStructure = z.infer<typeof IStructureSchema>;
export type IAnimationData = z.infer<typeof IAnimationDataSchema>;
export type IAnimationClip = z.infer<typeof IAnimationClipSchema>;
