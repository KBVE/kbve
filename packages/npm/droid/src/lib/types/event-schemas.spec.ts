import { describe, expect, it } from 'vitest';
import {
	DroidEventSchemas,
	DroidFirstConnectSchema,
	DroidReadySchema,
	AuthReadySchema,
	AuthErrorSchema,
	WorkerErrorSchema,
	PageLifecycleSchema,
	PanelEventSchema,
	DroidDownscaleSchema,
	DroidUpscaleSchema,
	DroidModReadySchema,
} from './event-types';

describe('DroidEventSchemas — happy path round-trips', () => {
	it.each([
		['droid-ready', DroidReadySchema, { timestamp: 1 }],
		[
			'droid-first-connect',
			DroidFirstConnectSchema,
			{ timestamp: 1, workersFirst: { db: true, ws: false } },
		],
		[
			'droid-mod-ready',
			DroidModReadySchema,
			{ meta: { id: 'x', name: 'X', version: '1.0.0' }, timestamp: 1 },
		],
		[
			'droid-downscale',
			DroidDownscaleSchema,
			{ timestamp: 1, level: 'minimal' },
		],
		['droid-upscale', DroidUpscaleSchema, { timestamp: 1, level: 'full' }],
		[
			'panel-open',
			PanelEventSchema,
			{ id: 'right', payload: { foo: 'bar' } },
		],
		['panel-close', PanelEventSchema, { id: 'top' }],
		[
			'auth-ready',
			AuthReadySchema,
			{ timestamp: 1, tone: 'auth' as const, name: 'Alice' },
		],
		[
			'auth-error',
			AuthErrorSchema,
			{ timestamp: 1, message: 'invalid grant' },
		],
		[
			'worker-error',
			WorkerErrorSchema,
			{
				timestamp: 1,
				worker: 'ws' as const,
				operation: 'connect',
				message: 'closed',
			},
		],
		[
			'page-mount',
			PageLifecycleSchema,
			{ timestamp: 1, url: '/foo', source: 'initial' as const },
		],
	])('%s accepts a valid payload', (_name, schema, payload) => {
		expect(schema.safeParse(payload).success).toBe(true);
	});
});

describe('DroidEventSchemas — rejection cases', () => {
	it('rejects droid-first-connect without workersFirst', () => {
		expect(
			DroidFirstConnectSchema.safeParse({ timestamp: 1 }).success,
		).toBe(false);
	});

	it('rejects auth-ready with an unknown tone', () => {
		expect(
			AuthReadySchema.safeParse({ timestamp: 1, tone: 'staff' }).success,
		).toBe(false);
	});

	it('rejects worker-error with an unknown worker name', () => {
		expect(
			WorkerErrorSchema.safeParse({
				timestamp: 1,
				worker: 'gateway',
				operation: 'x',
				message: 'y',
			}).success,
		).toBe(false);
	});

	it('rejects page-lifecycle with an unknown source', () => {
		expect(
			PageLifecycleSchema.safeParse({
				timestamp: 1,
				url: '/x',
				source: 'turbolinks',
			}).success,
		).toBe(false);
	});

	it('rejects schemas missing the timestamp field', () => {
		expect(DroidReadySchema.safeParse({}).success).toBe(false);
		expect(AuthErrorSchema.safeParse({ message: 'x' }).success).toBe(false);
	});
});

describe('DroidEventSchemas — registry contract', () => {
	it('every key resolves to a schema with safeParse', () => {
		for (const [key, schema] of Object.entries(DroidEventSchemas)) {
			expect(typeof (schema as { safeParse?: unknown }).safeParse).toBe(
				'function',
			);
			expect(key).toMatch(/^[a-z]+(-[a-z]+)+$/);
		}
	});
});
