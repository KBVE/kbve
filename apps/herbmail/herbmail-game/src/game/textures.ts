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
	arch: THREE.Texture;
	door: THREE.Texture;
	doorAlt: THREE.Texture;
}

export function useDungeonTextures(): DungeonTextures {
	const loaded = useTexture([
		...TEXTURES.walls.flatMap((w) => [w.color, w.normal, w.har]),
		TEXTURES.floor,
		TEXTURES.ceiling,
		TEXTURES.arch,
		TEXTURES.door,
		TEXTURES.doorAlt,
	]);

	return useMemo(() => {
		const wallCount = TEXTURES.walls.length;
		const walls = TEXTURES.walls.map((_, i) => ({
			color: psxify(loaded[i * 3], true, true),
			normal: dataify(loaded[i * 3 + 1], 4),
			har: dataify(loaded[i * 3 + 2]),
		}));
		const rest = wallCount * 3;
		const floor = psxify(loaded[rest], true);
		const ceiling = psxify(loaded[rest + 1], true);
		const arch = psxify(loaded[rest + 2], true);
		const door = psxify(loaded[rest + 3], true);
		const doorAlt = psxify(loaded[rest + 4], true);
		return { walls, floor, ceiling, arch, door, doorAlt };
	}, [loaded]);
}
