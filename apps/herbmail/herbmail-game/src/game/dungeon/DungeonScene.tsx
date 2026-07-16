import { useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import '../render/PsxMaterial';
import {
	buildArches,
	buildBays,
	buildCeiling,
	buildCornerCoves,
	buildCoves,
	buildFloor,
	buildWalls,
	type Grid,
} from '../geometry';
import { levelGrid } from '../level';
import { useDungeonTextures } from '../textures';
import { TINT } from '../config';

interface Props {
	snap: number;
	affine: number;
	grid?: Grid;
}

export function DungeonScene({ snap, affine, grid = levelGrid }: Props) {
	const size = useThree((s) => s.size);
	const res = useMemo(
		() => new THREE.Vector2(size.width, size.height),
		[size],
	);

	const tex = useDungeonTextures();

	const wallGeo = useMemo(() => buildWalls(grid), [grid]);
	const floorGeo = useMemo(() => buildFloor(grid), [grid]);
	const ceilGeo = useMemo(() => buildCeiling(grid), [grid]);
	const archGeo = useMemo(() => buildArches(grid), [grid]);
	const coveGeo = useMemo(() => buildCoves(grid), [grid]);
	const cornerGeo = useMemo(() => buildCornerCoves(grid), [grid]);
	const bays = useMemo(() => buildBays(grid), [grid]);

	const floorTint = useMemo(() => new THREE.Color(...TINT.floor), []);
	const ceilTint = useMemo(() => new THREE.Color(...TINT.ceiling), []);
	const archTint = useMemo(() => new THREE.Color(...TINT.arch), []);
	const coveTint = useMemo(() => new THREE.Color(...TINT.cove), []);
	const bayTint = useMemo(() => new THREE.Color(...TINT.bay), []);
	const bayBackTint = useMemo(() => new THREE.Color(...TINT.bayBack), []);

	return (
		<group>
			{wallGeo.map((geo, i) => (
				<mesh key={i} geometry={geo} userData={{ kind: 'wall' }}>
					<psxMaterial
						uMap={tex.walls[i].color}
						uNormalMap={tex.walls[i].normal}
						uHarMap={tex.walls[i].har}
						uUseMaps={1}
						uSnap={snap}
						uAffine={affine}
						uRes={res}
					/>
				</mesh>
			))}

			<mesh geometry={archGeo} userData={{ kind: 'archway' }}>
				<psxMaterial
					uMap={tex.arch.color}
					uNormalMap={tex.arch.normal}
					uHarMap={tex.arch.har}
					uUseMaps={1}
					uSnap={snap}
					uAffine={0}
					uRes={res}
					uTint={archTint}
				/>
			</mesh>

			<mesh geometry={floorGeo} userData={{ kind: 'floor' }}>
				<psxMaterial
					uMap={tex.floor}
					uSnap={snap}
					uAffine={affine}
					uRes={res}
					uTint={floorTint}
				/>
			</mesh>

			<mesh geometry={ceilGeo} userData={{ kind: 'ceiling' }}>
				<psxMaterial
					uMap={tex.ceiling}
					uSnap={snap}
					uAffine={affine}
					uRes={res}
					uTint={ceilTint}
				/>
			</mesh>

			<mesh geometry={coveGeo} userData={{ kind: 'vaulted cove' }}>
				<psxMaterial
					uMap={tex.walls[2].color}
					uNormalMap={tex.walls[2].normal}
					uHarMap={tex.walls[2].har}
					uUseMaps={1}
					uSnap={snap}
					uAffine={affine}
					uRes={res}
					uTint={coveTint}
					side={THREE.DoubleSide}
					polygonOffset
					polygonOffsetFactor={-2}
					polygonOffsetUnits={-2}
				/>
			</mesh>

			<mesh geometry={cornerGeo} userData={{ kind: 'corner vault' }}>
				<psxMaterial
					uMap={tex.walls[2].color}
					uNormalMap={tex.walls[2].normal}
					uHarMap={tex.walls[2].har}
					uUseMaps={1}
					uSnap={snap}
					uAffine={affine}
					uRes={res}
					uTint={coveTint}
					side={THREE.DoubleSide}
					polygonOffset
					polygonOffsetFactor={-4}
					polygonOffsetUnits={-4}
				/>
			</mesh>

			<mesh geometry={bays.frames} userData={{ kind: 'wall niche' }}>
				<psxMaterial
					uMap={tex.arch.color}
					uSnap={snap}
					uAffine={0}
					uRes={res}
					uTint={bayTint}
					side={THREE.DoubleSide}
					polygonOffset
					polygonOffsetFactor={-3}
					polygonOffsetUnits={-3}
				/>
			</mesh>

			<mesh geometry={bays.backs} userData={{ kind: 'niche recess' }}>
				<psxMaterial
					uMap={tex.arch.color}
					uSnap={snap}
					uAffine={0}
					uRes={res}
					uTint={bayBackTint}
					side={THREE.DoubleSide}
				/>
			</mesh>
		</group>
	);
}
