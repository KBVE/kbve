import { describe, it, expect } from 'vitest';
import { buildDispatchManifest, buildDispatchManifestSafe } from './manifest';
import type { CiProject } from './ci_registry-schema.js';

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

	it('collects an error for a broken npm entry but still processes the valid one', () => {
		const projects = [
			{ key: 'good', pipeline: 'npm', package_name: '@kbve/good' },
			{ key: 'bad', pipeline: 'npm' },
		] as unknown as CiProject[];
		const { manifest, errors } = buildDispatchManifestSafe(projects);
		expect(errors.length).toBe(1);
		expect(errors[0].key).toBe('bad');
		expect(manifest.npm).toEqual([
			{ key: 'good', package_name: '@kbve/good' },
		]);
	});

	it('collects an error for an unknown pipeline and continues the loop', () => {
		const projects = [
			{ key: 'mystery', pipeline: 'nope' },
			{ key: 'good', pipeline: 'npm', package_name: '@kbve/good' },
		] as unknown as CiProject[];
		const { manifest, errors } = buildDispatchManifestSafe(projects);
		expect(errors.length).toBe(1);
		expect(errors[0].key).toBe('mystery');
		expect(manifest.npm).toEqual([
			{ key: 'good', package_name: '@kbve/good' },
		]);
	});
});
