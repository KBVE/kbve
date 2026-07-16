import * as THREE from 'three';

export interface PomUniformValues {
	uHeightMap: THREE.Texture | null;
	uPomScale: number;
	uMinLayers: number;
	uMaxLayers: number;
	uSilhouette: number;
	uShadow: number;
}

export interface PomConfig {
	heightMap?: THREE.Texture | null;
	scale?: number;
	minLayers?: number;
	maxLayers?: number;
	silhouette?: boolean;
	shadow?: boolean;
}

export const POM_DEFAULTS: Readonly<
	Required<Omit<PomConfig, 'heightMap'>>
> = {
	scale: 0.08,
	minLayers: 8,
	maxLayers: 32,
	silhouette: false,
	shadow: false,
};

function clampLayers(n: number, fallback: number): number {
	if (!Number.isFinite(n)) return fallback;
	return Math.max(1, Math.round(n));
}

export function createPomUniforms(cfg: PomConfig = {}): PomUniformValues {
	const scale = Number.isFinite(cfg.scale as number)
		? Math.max(0, cfg.scale as number)
		: POM_DEFAULTS.scale;
	const min = clampLayers(
		cfg.minLayers ?? POM_DEFAULTS.minLayers,
		POM_DEFAULTS.minLayers,
	);
	const maxRaw = clampLayers(
		cfg.maxLayers ?? POM_DEFAULTS.maxLayers,
		POM_DEFAULTS.maxLayers,
	);
	const max = Math.max(min, maxRaw);
	return {
		uHeightMap: cfg.heightMap ?? null,
		uPomScale: scale,
		uMinLayers: min,
		uMaxLayers: max,
		uSilhouette: (cfg.silhouette ?? POM_DEFAULTS.silhouette) ? 1 : 0,
		uShadow: (cfg.shadow ?? POM_DEFAULTS.shadow) ? 1 : 0,
	};
}

export function toThreeUniforms(
	values: PomUniformValues,
): Record<keyof PomUniformValues, { value: unknown }> {
	return {
		uHeightMap: { value: values.uHeightMap },
		uPomScale: { value: values.uPomScale },
		uMinLayers: { value: values.uMinLayers },
		uMaxLayers: { value: values.uMaxLayers },
		uSilhouette: { value: values.uSilhouette },
		uShadow: { value: values.uShadow },
	};
}
