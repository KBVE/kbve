import { useMemo } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { ANISOTROPY, TEXTURES } from './config';

export function psxify(tex: THREE.Texture, tiling: boolean): THREE.Texture {
	tex.magFilter = THREE.NearestFilter;
	tex.minFilter = THREE.NearestMipmapNearestFilter;
	tex.generateMipmaps = true;
	tex.anisotropy = ANISOTROPY;
	const wrap = tiling ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
	tex.wrapS = wrap;
	tex.wrapT = wrap;
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.needsUpdate = true;
	return tex;
}

export interface DungeonTextures {
	walls: THREE.Texture[];
	floor: THREE.Texture;
	ceiling: THREE.Texture;
	arch: THREE.Texture;
}

export function useDungeonTextures(): DungeonTextures {
	const loaded = useTexture([
		...TEXTURES.walls,
		TEXTURES.floor,
		TEXTURES.ceiling,
	]);

	return useMemo(() => {
		const wallCount = TEXTURES.walls.length;
		const walls = loaded.slice(0, wallCount).map((t) => psxify(t, false));
		const floor = psxify(loaded[wallCount], true);
		const ceiling = psxify(loaded[wallCount + 1], true);
		const brick = walls[1] ?? walls[0];
		const arch = psxify(brick.clone(), true);
		return { walls, floor, ceiling, arch };
	}, [loaded]);
}
