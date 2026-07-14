import { useMemo, type ReactElement } from 'react';
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

function ChunkGroup({
	geos,
	kind,
	mat,
}: {
	geos: THREE.BufferGeometry[];
	kind: string;
	mat: () => ReactElement;
}) {
	return (
		<>
			{geos.map((g, i) => (
				<mesh key={i} geometry={g} userData={{ kind }}>
					{mat()}
				</mesh>
			))}
		</>
	);
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
			{set.walls.map((chunks, i) => (
				<ChunkGroup
					key={i}
					geos={chunks}
					kind="wall"
					mat={() => (
						<psxMaterial
							uMap={tex.walls[i]}
							uSnap={snap}
							uAffine={affine}
							uRes={res}
							uPom={1}
						/>
					)}
				/>
			))}

			{set.columns.map((chunks, i) => (
				<ChunkGroup
					key={`col${i}`}
					geos={chunks}
					kind="column"
					mat={() => (
						<psxMaterial
							uMap={tex.walls[i]}
							uSnap={snap}
							uAffine={affine}
							uRes={res}
							uPom={1}
						/>
					)}
				/>
			))}

			<ChunkGroup
				geos={set.arch}
				kind="archway"
				mat={() => (
					<psxMaterial
						uMap={tex.arch}
						uSnap={snap}
						uAffine={0}
						uRes={res}
						uTint={archTint}
					/>
				)}
			/>

			<ChunkGroup
				geos={set.floor}
				kind="floor"
				mat={() => (
					<psxMaterial
						uMap={tex.floor}
						uSnap={snap}
						uAffine={affine}
						uRes={res}
						uTint={floorTint}
					/>
				)}
			/>

			<ChunkGroup
				geos={set.ceiling}
				kind="ceiling"
				mat={() => (
					<psxMaterial
						uMap={tex.ceiling}
						uSnap={snap}
						uAffine={affine}
						uRes={res}
						uTint={ceilTint}
					/>
				)}
			/>

			<ChunkGroup
				geos={set.cove}
				kind="vaulted cove"
				mat={() => (
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
				)}
			/>

			<ChunkGroup
				geos={set.corner}
				kind="corner vault"
				mat={() => (
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
				)}
			/>

			<ChunkGroup
				geos={set.bays.frames}
				kind="wall niche"
				mat={() => (
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
				)}
			/>

			<ChunkGroup
				geos={set.bays.backs}
				kind="niche recess"
				mat={() => (
					<psxMaterial
						uMap={tex.arch}
						uSnap={snap}
						uAffine={0}
						uRes={res}
						uTint={bayBackTint}
						uOcclude={0}
						side={THREE.DoubleSide}
					/>
				)}
			/>

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
