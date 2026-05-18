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

export const DroidFirstConnectSchema = z.object({
	timestamp: z.number(),
	workersFirst: z.object({
		db: z.boolean(),
		ws: z.boolean(),
	}),
});

export const DroidDownscaleSchema = z.object({
	timestamp: z.number(),
	level: z.string(),
});

export const DroidUpscaleSchema = z.object({
	timestamp: z.number(),
	level: z.string(),
});

export const AuthReadySchema = z.object({
	timestamp: z.number(),
	tone: z.enum(['auth', 'anon']),
	name: z.string().optional(),
});

export const AuthErrorSchema = z.object({
	timestamp: z.number(),
	message: z.string(),
});

export const WorkerErrorSchema = z.object({
	timestamp: z.number(),
	worker: z.enum(['shared', 'db', 'ws']),
	operation: z.string(),
	message: z.string(),
});

export const GatewayStrategyFallbackSchema = z.object({
	timestamp: z.number(),
	from: z.enum(['shared-worker', 'web-worker', 'direct']),
	to: z.enum(['shared-worker', 'web-worker', 'direct']),
	reason: z.string(),
});

// Page lifecycle — emitted by @kbve/astro's onMount/onSwap helpers so any
// module on the bus (mods, plugins, vanilla driver) can react to navigation
// without knowing whether the host is using ClientRouter, native cross-doc
// view transitions, full reloads, or bfcache restores.
export const PageLifecycleSchema = z.object({
	timestamp: z.number(),
	url: z.string(),
	source: z.enum(['initial', 'astro-swap', 'page-reveal', 'bfcache']),
});

export const DroidEventSchemas = {
	'droid-first-connect': DroidFirstConnectSchema,
	'droid-ready': DroidReadySchema,
	'droid-mod-ready': DroidModReadySchema,
	'droid-downscale': DroidDownscaleSchema,
	'droid-upscale': DroidUpscaleSchema,
	'panel-open': PanelEventSchema,
	'panel-close': PanelEventSchema,
	'toast-added': ToastPayloadSchema,
	'toast-removed': ToastPayloadSchema.pick({ id: true }),
	'tooltip-opened': TooltipPayloadSchema,
	'tooltip-closed': TooltipPayloadSchema.pick({ id: true }),
	'modal-opened': ModalPayloadSchema,
	'modal-closed': ModalPayloadSchema.pick({ id: true }),
	'auth-ready': AuthReadySchema,
	'auth-error': AuthErrorSchema,
	'worker-error': WorkerErrorSchema,
	'gateway-strategy-fallback': GatewayStrategyFallbackSchema,
	'page-mount': PageLifecycleSchema,
	'page-swap': PageLifecycleSchema,
	'page-hide': PageLifecycleSchema,
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
