import { z } from 'zod';
import { PanelIdSchema } from './panel-types';

export const ModMetaSchema = z.object({
	name: z.string(),
	version: z.string().optional(),
});

export const DroidModReadySchema = z.object({
	meta: ModMetaSchema.optional(),
	timestamp: z.number(),
});

export const PanelEventSchema = z.object({
	id: PanelIdSchema,
	payload: z.any().optional(),
});

export const DroidEventSchemas = {
	'droid-ready': z.undefined(), 
	'droid-mod-ready': DroidModReadySchema,
	'panel-open': PanelEventSchema,
	'panel-close': PanelEventSchema,
};

export type DroidEventMap = {
	[K in keyof typeof DroidEventSchemas]: z.infer<(typeof DroidEventSchemas)[K]>;
};