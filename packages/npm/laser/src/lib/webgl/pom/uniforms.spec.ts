import { describe, it, expect } from 'vitest';
import { createPomUniforms, POM_DEFAULTS, toThreeUniforms } from './uniforms';

describe('createPomUniforms', () => {
	it('applies defaults when config is empty', () => {
		const u = createPomUniforms();
		expect(u.uHeightMap).toBeNull();
		expect(u.uPomScale).toBe(POM_DEFAULTS.scale);
		expect(u.uMinLayers).toBe(POM_DEFAULTS.minLayers);
		expect(u.uMaxLayers).toBe(POM_DEFAULTS.maxLayers);
		expect(u.uSilhouette).toBe(0);
		expect(u.uShadow).toBe(0);
	});

	it('maps boolean flags to 0/1 floats', () => {
		const u = createPomUniforms({ silhouette: true, shadow: true });
		expect(u.uSilhouette).toBe(1);
		expect(u.uShadow).toBe(1);
	});

	it('clamps negative scale to zero', () => {
		expect(createPomUniforms({ scale: -5 }).uPomScale).toBe(0);
	});

	it('rounds and floors layer counts to at least 1', () => {
		const u = createPomUniforms({ minLayers: 0.2, maxLayers: 10.6 });
		expect(u.uMinLayers).toBe(1);
		expect(u.uMaxLayers).toBe(11);
	});

	it('keeps maxLayers >= minLayers when inverted', () => {
		const u = createPomUniforms({ minLayers: 40, maxLayers: 8 });
		expect(u.uMinLayers).toBe(40);
		expect(u.uMaxLayers).toBe(40);
	});

	it('falls back to defaults for non-finite input', () => {
		const u = createPomUniforms({ scale: NaN, minLayers: Infinity });
		expect(u.uPomScale).toBe(POM_DEFAULTS.scale);
		expect(u.uMinLayers).toBe(POM_DEFAULTS.minLayers);
	});
});

describe('toThreeUniforms', () => {
	it('wraps each value in a { value } cell', () => {
		const wrapped = toThreeUniforms(createPomUniforms({ scale: 0.2 }));
		expect(wrapped.uPomScale).toEqual({ value: 0.2 });
		expect(wrapped.uHeightMap).toEqual({ value: null });
	});
});
