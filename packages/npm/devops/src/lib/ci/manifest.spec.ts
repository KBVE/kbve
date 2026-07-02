import { describe, it, expect } from 'vitest';
import { buildDispatchManifest, buildDispatchManifestSafe } from './manifest';

describe('buildDispatchManifestSafe (v0.0.21)', () => {
	it('returns a manifest and an empty error list for the real registry', () => {
		const { manifest, errors } = buildDispatchManifestSafe();
		expect(errors).toEqual([]);
		expect(Array.isArray(manifest.npm)).toBe(true);
		expect(manifest.npm.length).toBeGreaterThan(0);
	});

	it('matches the strict builder output when the registry is valid', () => {
		const strict = buildDispatchManifest();
		const { manifest } = buildDispatchManifestSafe();
		expect(manifest).toEqual(strict);
	});
});
