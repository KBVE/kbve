import { useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import '../render/PsxMaterial';
import { TILE, TINT } from '../config';
import { useDungeonTextures } from '../textures';
import { getRoomGeoSet } from './roomGeometry';
import { roomDoors } from '../door/doors';
import { DoorLeaf } from '../door/DoorLeaf';
import type { RoomDesc } from './generate';

interface Props {
	desc: RoomDesc;
	snap: number;
	affine: number;
}

export function RoomView({ desc, snap, affine }: Props) {
	const size = useThree((s) => s.size);
	const res = useMemo(
		() => new THREE.Vector2(size.width, size.height),
		[size],
	);
	const tex = useDungeonTextures();
	const set = useMemo(() => getRoomGeoSet(desc), [desc.signature]);
	const doors = useMemo(() => roomDoors(desc), [desc]);

	const floorTint = useMemo(() => new THREE.Color(...TINT.floor), []);
	const ceilTint = useMemo(() => new THREE.Color(...TINT.ceiling), []);
	const archTint = useMemo(() => new THREE.Color(...TINT.arch), []);
	const coveTint = useMemo(() => new THREE.Color(...TINT.cove), []);
	const bayTint = useMemo(() => new THREE.Color(...TINT.bay), []);
	const bayBackTint = useMemo(() => new THREE.Color(...TINT.bayBack), []);

	return (
		<group position={[desc.originCol * TILE, 0, desc.originRow * TILE]}>
			{set.walls.map((geo, i) => (
				<mesh key={i} geometry={geo} userData={{ kind: 'wall' }}>
					<psxMaterial
						uMap={tex.walls[i]}
						uSnap={snap}
						uAffine={affine}
						uRes={res}
					/>
				</mesh>
			))}

			<mesh geometry={set.arch} userData={{ kind: 'archway' }}>
				<psxMaterial
					uMap={tex.arch}
					uSnap={snap}
					uAffine={0}
					uRes={res}
					uTint={archTint}
				/>
			</mesh>

			<mesh geometry={set.floor} userData={{ kind: 'floor' }}>
				<psxMaterial
					uMap={tex.floor}
					uSnap={snap}
					uAffine={affine}
					uRes={res}
					uTint={floorTint}
				/>
			</mesh>

			<mesh geometry={set.ceiling} userData={{ kind: 'ceiling' }}>
				<psxMaterial
					uMap={tex.ceiling}
					uSnap={snap}
					uAffine={affine}
					uRes={res}
					uTint={ceilTint}
				/>
			</mesh>

			<mesh geometry={set.cove} userData={{ kind: 'vaulted cove' }}>
				<psxMaterial
					uMap={tex.walls[2]}
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

			<mesh geometry={set.corner} userData={{ kind: 'corner vault' }}>
				<psxMaterial
					uMap={tex.walls[2]}
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

			<mesh geometry={set.bays.frames} userData={{ kind: 'wall niche' }}>
				<psxMaterial
					uMap={tex.arch}
					uSnap={snap}
					uAffine={0}
					uRes={res}
					uTint={bayTint}
					uOcclude={0}
					side={THREE.DoubleSide}
					polygonOffset
					polygonOffsetFactor={-3}
					polygonOffsetUnits={-3}
				/>
			</mesh>

			<mesh geometry={set.bays.backs} userData={{ kind: 'niche recess' }}>
				<psxMaterial
					uMap={tex.arch}
					uSnap={snap}
					uAffine={0}
					uRes={res}
					uTint={bayBackTint}
					uOcclude={0}
					side={THREE.DoubleSide}
				/>
			</mesh>

			{doors.map((d) => (
				<DoorLeaf
					key={d.key}
					door={d}
					snap={snap}
					affine={affine}
					res={res}
				/>
			))}
		</group>
	);
}
