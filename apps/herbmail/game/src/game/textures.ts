import { useMemo } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { ANISOTROPY, TEXTURES } from './config';

export function psxify(
	tex: THREE.Texture,
	tiling: boolean,
	smooth = false,
): THREE.Texture {
	tex.magFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
	tex.minFilter = smooth
		? THREE.LinearMipmapLinearFilter
		: THREE.NearestMipmapNearestFilter;
	tex.generateMipmaps = true;
	tex.anisotropy = ANISOTROPY;
	const wrap = tiling ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
	tex.wrapS = wrap;
	tex.wrapT = wrap;
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.needsUpdate = true;
	return tex;
}

export function dataify(tex: THREE.Texture, anisotropy = 1): THREE.Texture {
	tex.magFilter = THREE.LinearFilter;
	tex.minFilter = THREE.LinearMipmapLinearFilter;
	tex.generateMipmaps = true;
	tex.anisotropy = anisotropy;
	tex.wrapS = THREE.RepeatWrapping;
	tex.wrapT = THREE.RepeatWrapping;
	tex.colorSpace = THREE.NoColorSpace;
	tex.needsUpdate = true;
	return tex;
}

export interface WallMaps {
	color: THREE.Texture;
	normal: THREE.Texture;
	har: THREE.Texture;
}

export interface DungeonTextures {
	walls: WallMaps[];
	floor: THREE.Texture;
	ceiling: THREE.Texture;
	arch: WallMaps;
	trim: WallMaps;
	door: WallMaps;
}

const PACKS = [TEXTURES.arch, TEXTURES.trim, TEXTURES.door];

export function useDungeonTextures(): DungeonTextures {
	const loaded = useTexture([
		...TEXTURES.walls.flatMap((w) => [w.color, w.normal, w.har]),
		TEXTURES.floor,
		TEXTURES.ceiling,
		...PACKS.flatMap((p) => [p.color, p.normal, p.har]),
	]);

	return useMemo(() => {
		const pack = (base: number): WallMaps => ({
			color: psxify(loaded[base], true, true),
			normal: dataify(loaded[base + 1], 4),
			har: dataify(loaded[base + 2]),
		});
		const walls = TEXTURES.walls.map((_, i) => pack(i * 3));
		const rest = TEXTURES.walls.length * 3;
		const floor = psxify(loaded[rest], true);
		const ceiling = psxify(loaded[rest + 1], true);
		const arch = pack(rest + 2);
		const trim = pack(rest + 5);
		const door = pack(rest + 8);
		return { walls, floor, ceiling, arch, trim, door };
	}, [loaded]);
}
