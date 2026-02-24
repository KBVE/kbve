import { z } from 'zod';
import { PanelIdSchema } from './panel-types';
import {
	ToastPayloadSchema,
	TooltipPayloadSchema,
	ModalPayloadSchema,
} from './ui-event-types';

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

export const DroidReadySchema = z.object({
	timestamp: z.number(),
});

export const DroidEventSchemas = {
	'droid-ready': DroidReadySchema,
	'droid-mod-ready': DroidModReadySchema,
	'panel-open': PanelEventSchema,
	'panel-close': PanelEventSchema,
	'toast-added': ToastPayloadSchema,
	'toast-removed': ToastPayloadSchema.pick({ id: true }),
	'tooltip-opened': TooltipPayloadSchema,
	'tooltip-closed': TooltipPayloadSchema.pick({ id: true }),
	'modal-opened': ModalPayloadSchema,
	'modal-closed': ModalPayloadSchema.pick({ id: true }),
};

export type DroidEventMap = {
	[K in keyof typeof DroidEventSchemas]: z.infer<
		(typeof DroidEventSchemas)[K]
	>;
};

export type EventKey = keyof DroidEventMap;
export type EventHandler<K extends EventKey> = (
	payload: DroidEventMap[K],
) => void;
