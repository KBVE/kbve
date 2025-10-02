// IMapSchema.ts
import { z } from 'astro:content';
import { ULID, GUID } from 'src/data/types';

// Enums
export const ResourceTypeEnum = z.enum(['none', 'wood', 'stone', 'metal', 'food']);
export const StructureTypeEnum = z.enum(['building', 'wall', 'tower', 'decoration']);
export const MapObjectTypeEnum = z.enum(['resource', 'structure']);

// Animation schemas
export const ISpriteAnimationFrameSchema = z.object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
});

export const IAnimationFrameRangeSchema = z.object({
    offset: z.number().int().nonnegative().default(0),
    count: z.number().int().positive(),
});

export const IAnimationClipSchema = z.object({
    id: z.string(), // Animation ID (e.g., "idle", "sway", "harvest", "construct")
    name: z.string().optional(),
    
    // Sprite sheet layout
    frameCount: ISpriteAnimationFrameSchema, // Total frames in X,Y grid
    frameRange: IAnimationFrameRangeSchema, // Which frames to use for this animation
    
    // Timing
    frameDurations: z.array(z.number().positive()), // Duration for each frame (in seconds)
    loop: z.boolean().default(true),
    
    // Playback
    playOnStart: z.boolean().default(false),
    priority: z.number().int().nonnegative().default(0), // Higher priority animations override lower
});

export const IAnimationDataSchema = z.object({
    hasAnimation: z.boolean().default(false),
    spriteSheetPath: z.string().optional(), // Path to sprite sheet if different from imagePath
    clips: z.array(IAnimationClipSchema).optional(),
    defaultClip: z.string().optional(), // ID of default animation to play
});

// Base schema - shared properties
const BaseMapObjectSchema = z.object({
    id: ULID,
    guid: GUID,
    drafted: z.boolean().optional().default(false),
    name: z.string(),
    description: z.string().optional(),
    
    // Visual properties
    imagePath: z.string(), // Static sprite or sprite sheet
    pixelsPerUnit: z.number().int().positive().default(16),
    pivotX: z.number().min(0).max(1).default(0.5),
    pivotY: z.number().min(0).max(1).default(0),
    
    // Rendering
    sortingLayer: z.string().default('Foreground'),
    sortingOrderOffset: z.number().int().default(0),
    
    // Animation (optional)
    animation: IAnimationDataSchema.optional(),
});

// Resource-specific schema
export const IResourceSchema = BaseMapObjectSchema.extend({
    type: z.literal('resource'),
    resourceType: ResourceTypeEnum.default('wood'),
    
    // Resource amounts
    amount: z.number().int().min(0).max(65535),
    maxAmount: z.number().int().min(0).max(65535),
    harvestYield: z.number().int().min(1).max(65535).default(1),
    harvestTime: z.number().min(0.1).default(2.0),
    
    // State flags
    isHarvestable: z.boolean().default(true),
    isDepleted: z.boolean().default(false),
    
    // Spawning
    spawnWeight: z.number().min(0).max(1).default(1.0),
    spawnCount: z.number().int().nonnegative().optional(),
}).passthrough();

// Structure-specific schema
export const IStructureSchema = BaseMapObjectSchema.extend({
    type: z.literal('structure'),
    structureType: StructureTypeEnum.default('building'),
    
    // Footprint
    footprintWidth: z.number().int().positive().default(1),
    footprintHeight: z.number().int().positive().default(1),
    
    // Properties
    isWalkable: z.boolean().default(false),
    blocksPlacement: z.boolean().default(true),
    
    // Health/Construction
    maxHealth: z.number().int().positive().default(100),
    constructionTime: z.number().nonnegative().default(0),
    
    // Costs (future)
    buildCosts: z
        .array(
            z.object({
                resourceType: ResourceTypeEnum,
                amount: z.number().int().positive(),
            }),
        )
        .optional(),
}).passthrough();

// Union type for map objects
export const IMapObjectSchema = z.discriminatedUnion('type', [
    IResourceSchema,
    IStructureSchema,
]);

// Type exports
export type IMapObject = z.infer<typeof IMapObjectSchema>;
export type IResource = z.infer<typeof IResourceSchema>;
export type IStructure = z.infer<typeof IStructureSchema>;
export type IAnimationData = z.infer<typeof IAnimationDataSchema>;
export type IAnimationClip = z.infer<typeof IAnimationClipSchema>;