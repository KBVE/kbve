import { describe, it, expect } from 'vitest';
import {
	DroidEventSchemas,
	DroidReadySchema,
	DroidFirstConnectSchema,
	DroidDownscaleSchema,
	DroidUpscaleSchema,
} from './event-types';

describe('DroidEventSchemas', () => {
	it('has all expected event keys', () => {
		const keys = Object.keys(DroidEventSchemas);
		expect(keys).toContain('droid-first-connect');
		expect(keys).toContain('droid-ready');
		expect(keys).toContain('droid-mod-ready');
		expect(keys).toContain('droid-downscale');
		expect(keys).toContain('droid-upscale');
		expect(keys).toContain('panel-open');
		expect(keys).toContain('panel-close');
		expect(keys).toContain('toast-added');
		expect(keys).toContain('toast-removed');
		expect(keys).toContain('tooltip-opened');
		expect(keys).toContain('tooltip-closed');
		expect(keys).toContain('modal-opened');
		expect(keys).toContain('modal-closed');
		expect(keys).toContain('auth-ready');
		expect(keys).toContain('auth-error');
	});

	it('has exactly 16 event types', () => {
		expect(Object.keys(DroidEventSchemas)).toHaveLength(16);
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
