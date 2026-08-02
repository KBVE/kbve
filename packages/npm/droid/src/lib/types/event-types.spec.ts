import { describe, it, expect } from 'vitest';
import {
	DroidEventSchemas,
	DroidReadySchema,
	DroidFirstConnectSchema,
	DroidDownscaleSchema,
	DroidUpscaleSchema,
} from './event-types';

const EXPECTED_EVENT_KEYS = [
	'auth-error',
	'auth-ready',
	'droid-downscale',
	'droid-first-connect',
	'droid-mod-ready',
	'droid-ready',
	'droid-upscale',
	'gateway-strategy-fallback',
	'modal-closed',
	'modal-opened',
	'page-hide',
	'page-mount',
	'page-swap',
	'palworld-live-snapshot',
	'panel-close',
	'panel-open',
	'reel-stream',
	'toast-added',
	'toast-removed',
	'tooltip-closed',
	'tooltip-opened',
	'worker-error',
];

describe('DroidEventSchemas', () => {
	it('registers exactly the expected event keys', () => {
		expect(Object.keys(DroidEventSchemas).sort()).toEqual(
			EXPECTED_EVENT_KEYS,
		);
	});

	it('maps every key to a parseable schema', () => {
		for (const [key, schema] of Object.entries(DroidEventSchemas)) {
			expect(schema, key).toBeDefined();
			expect(typeof schema.safeParse, key).toBe('function');
		}
	});
});

describe('DroidReadySchema', () => {
	it('accepts valid payload', () => {
		const result = DroidReadySchema.safeParse({ timestamp: 123 });
		expect(result.success).toBe(true);
	});

	it('rejects missing timestamp', () => {
		const result = DroidReadySchema.safeParse({});
		expect(result.success).toBe(false);
	});

	it('rejects non-number timestamp', () => {
		const result = DroidReadySchema.safeParse({ timestamp: 'now' });
		expect(result.success).toBe(false);
	});
});

describe('DroidFirstConnectSchema', () => {
	it('accepts valid payload', () => {
		const result = DroidFirstConnectSchema.safeParse({
			timestamp: 1,
			workersFirst: { db: true, ws: false },
		});
		expect(result.success).toBe(true);
	});

	it('rejects missing workersFirst', () => {
		const result = DroidFirstConnectSchema.safeParse({ timestamp: 1 });
		expect(result.success).toBe(false);
	});
});

describe('DroidDownscaleSchema', () => {
	it('accepts valid payload', () => {
		const result = DroidDownscaleSchema.safeParse({
			timestamp: 1,
			level: 'minimal',
		});
		expect(result.success).toBe(true);
	});

	it('rejects missing level', () => {
		const result = DroidDownscaleSchema.safeParse({ timestamp: 1 });
		expect(result.success).toBe(false);
	});
});

describe('DroidUpscaleSchema', () => {
	it('accepts valid payload', () => {
		const result = DroidUpscaleSchema.safeParse({
			timestamp: 1,
			level: 'full',
		});
		expect(result.success).toBe(true);
	});

	it('rejects missing timestamp', () => {
		const result = DroidUpscaleSchema.safeParse({ level: 'full' });
		expect(result.success).toBe(false);
	});
});
