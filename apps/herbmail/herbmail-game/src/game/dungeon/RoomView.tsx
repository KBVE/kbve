import { useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import '../render/PsxMaterial';
import { TILE } from '../config';
import { getRoomGeoSet } from './roomGeometry';
import { roomDoors } from '../door/doors';
import { DoorLeaf } from '../door/DoorLeaf';
import type { RoomDesc } from './generate';
import type { DungeonMaterials } from './dungeonMaterials';

interface Props {
	desc: RoomDesc;
	snap: number;
	affine: number;
	mats: DungeonMaterials;
}

function ChunkGroup({
	geos,
	kind,
	material,
}: {
	geos: THREE.BufferGeometry[];
	kind: string;
	material: THREE.Material;
}) {
	return (
		<>
			{geos.map((g, i) => (
				<mesh
					key={i}
					geometry={g}
					material={material}
					userData={{ kind }}
				/>
			))}
		</>
	);
}

export function RoomView({ desc, snap, affine, mats }: Props) {
	const size = useThree((s) => s.size);
	const res = useMemo(
		() => new THREE.Vector2(size.width, size.height),
		[size],
	);
	const set = useMemo(() => getRoomGeoSet(desc), [desc.signature]);
	const doors = useMemo(() => roomDoors(desc), [desc]);

	return (
		<group position={[desc.originCol * TILE, 0, desc.originRow * TILE]}>
			{set.walls.map((chunks, i) => (
				<ChunkGroup
					key={i}
					geos={chunks}
					kind="wall"
					material={mats.walls[i]}
				/>
			))}

			{set.columns.map((chunks, i) => (
				<ChunkGroup
					key={`col${i}`}
					geos={chunks}
					kind="column"
					material={mats.walls[i]}
				/>
			))}

			<ChunkGroup geos={set.domes} kind="dome" material={mats.dome} />
			<ChunkGroup geos={set.arch} kind="archway" material={mats.arch} />
			<ChunkGroup geos={set.trim} kind="door trim" material={mats.trim} />
			<ChunkGroup geos={set.floor} kind="floor" material={mats.floor} />
			<ChunkGroup
				geos={set.ceiling}
				kind="ceiling"
				material={mats.ceiling}
			/>
			<ChunkGroup
				geos={set.cove}
				kind="vaulted cove"
				material={mats.cove}
			/>
			<ChunkGroup
				geos={set.corner}
				kind="corner vault"
				material={mats.corner}
			/>
			<ChunkGroup
				geos={set.bays.frames}
				kind="wall niche"
				material={mats.bayFrame}
			/>
			<ChunkGroup
				geos={set.bays.backs}
				kind="niche recess"
				material={mats.bayBack}
			/>

			{doors.map((d) => (
				<DoorLeaf key={d.key} door={d} snap={snap} res={res} />
			))}
		</group>
	);
}
