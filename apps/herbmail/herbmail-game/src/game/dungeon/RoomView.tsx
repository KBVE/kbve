import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import '../render/PsxMaterial';
import { TILE } from '../config';
import { getRoomGeoSet } from './roomGeometry';
import { roomDoors } from '../door/doors';
import { DoorLeaf } from '../door/DoorLeaf';
import type { RoomDesc } from './generate';
import type { DungeonMaterials } from './dungeonMaterials';
import { useViewportSize } from '../render/useViewportSize';

interface Props {
	desc: RoomDesc;
	snap: number;
	affine: number;
	mats: DungeonMaterials;
}

// A frozen mesh never dirties itself, so without this its matrixWorld would stay
// identity and it would draw at the world origin. One flag on mount is enough:
// the next updateMatrixWorld multiplies it through the parent and clears it.
function markWorld(m: THREE.Object3D | null): void {
	if (m) m.matrixWorldNeedsUpdate = true;
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
					ref={markWorld}
					geometry={g}
					material={material}
					userData={{ kind }}
					matrixAutoUpdate={false}
				/>
			))}
		</>
	);
}

function RoomViewImpl({ desc, snap, affine, mats }: Props) {
	const size = useViewportSize();
	const res = useMemo(
		() => new THREE.Vector2(size.width, size.height),
		[size],
	);
	const set = useMemo(() => getRoomGeoSet(desc), [desc.signature]);
	const doors = useMemo(() => roomDoors(desc), [desc]);
	const root = useRef<THREE.Group>(null);

	// A room never moves once placed, and neither do its chunk meshes, which sit
	// at identity under this group. Left on auto, three recomposes a matrix and
	// multiplies by the parent for every one of them every frame — measured at
	// 0.37ms across ~4800 objects, all of it recomputing constants. Freezing the
	// meshes alone would do nothing: updateMatrixWorld cascades force=true to
	// every child of a dirty parent, so this group has to be frozen too, which
	// means composing its matrix by hand once per placement.
	useLayoutEffect(() => {
		const g = root.current;
		if (!g) return;
		g.matrixAutoUpdate = false;
		g.updateMatrix();
		g.matrixWorldNeedsUpdate = true;
	}, [desc.originCol, desc.originRow]);

	return (
		<group
			ref={root}
			position={[desc.originCol * TILE, 0, desc.originRow * TILE]}>
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

// The mount set changes on every margin crossing, not just sector crossings, and
// each change re-rendered all 8-9 resident rooms — ~1600 chunk meshes reconciled
// for a set that usually gained one room. Every prop here is a stable reference
// across a rebuild (desc objects are owned by the dungeon world, mats is memoed),
// so identity comparison is enough to leave untouched rooms alone.
export const RoomView = memo(RoomViewImpl);
