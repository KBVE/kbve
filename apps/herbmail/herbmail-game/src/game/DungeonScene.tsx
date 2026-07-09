import { useMemo } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import './PsxMaterial';
import { buildCeiling, buildFloor, buildWalls } from './geometry';

function psxify(tex: THREE.Texture, tiling: boolean): THREE.Texture {
	tex.magFilter = THREE.NearestFilter;
	tex.minFilter = THREE.NearestMipmapNearestFilter;
	tex.generateMipmaps = true;
	tex.anisotropy = 8;
	const wrap = tiling ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
	tex.wrapS = wrap;
	tex.wrapT = wrap;
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.needsUpdate = true;
	return tex;
}

export function DungeonScene() {
	const [wall, brick, stone, floor, ceil] = useTexture([
		'/textures/Horror_Wall_01-256x256.png',
		'/textures/Horror_Brick_01-256x256.png',
		'/textures/Horror_Stone_01-256x256.png',
		'/textures/Horror_Floor_01-256x256.png',
		'/textures/Horror_Metal_01-256x256.png',
	]);

	const wallTex = useMemo(
		() => [psxify(wall, false), psxify(brick, false), psxify(stone, false)],
		[wall, brick, stone],
	);
	const floorTex = useMemo(() => psxify(floor, true), [floor]);
	const ceilTex = useMemo(() => psxify(ceil, true), [ceil]);

	const wallGeo = useMemo(() => buildWalls(), []);
	const floorGeo = useMemo(() => buildFloor(), []);
	const ceilGeo = useMemo(() => buildCeiling(), []);

	return (
		<group>
			{wallGeo.map((geo, i) => (
				<mesh key={i} geometry={geo}>
					<psxMaterial uMap={wallTex[i]} uSnap={140} />
				</mesh>
			))}

			<mesh geometry={floorGeo}>
				<psxMaterial
					uMap={floorTex}
					uSnap={140}
					uTint={new THREE.Color(0.7, 0.7, 0.75)}
				/>
			</mesh>

			<mesh geometry={ceilGeo}>
				<psxMaterial
					uMap={ceilTex}
					uSnap={140}
					uTint={new THREE.Color(0.45, 0.45, 0.5)}
				/>
			</mesh>
		</group>
	);
}
