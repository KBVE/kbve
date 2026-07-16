import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import '../render/PsxMaterial';
import { TILE, TINT } from '../config';
import { jitter } from '../geometry/rng';
import { ARCH_SALT } from '../geometry/arches';
import { scaleUV } from '../geometry/uv';
import { Door } from './components';
import { useDungeonTextures } from '../textures';
import { doorEid, type DoorInfo } from './doors';

const HALF = TILE / 2;
const DEPTH = 0.12;
const INSET = 0.05;
const OPEN_ANGLE = -Math.PI * 0.62;
const SWING_LERP = 10;

// Arch-topped leaf silhouette matching archShape's hole (jambs + semicircle),
// inset so it seats inside the frame. Built hinged: left edge on the jamb (x=0),
// extending to the far jamb, so the parent pivot swings it about that jamb.
function makeLeaf(openHW: number, spring: number): THREE.BufferGeometry {
	const ow = Math.max(0.05, openHW - INSET);
	const shape = new THREE.Shape();
	shape.moveTo(-ow, 0);
	shape.lineTo(ow, 0);
	shape.lineTo(ow, spring);
	shape.absarc(0, spring, ow, 0, Math.PI, false);
	shape.lineTo(-ow, 0);
	const g = new THREE.ExtrudeGeometry(shape, {
		depth: DEPTH,
		bevelEnabled: false,
	});
	scaleUV(g, 1 / TILE);
	g.translate(ow, 0, -DEPTH / 2);
	return g;
}

interface Props {
	door: DoorInfo;
	snap: number;
	res: THREE.Vector2;
}

// Renders the wood leaf for a door tile. The list is deterministic (roomDoors),
// but the mutable state — locked + swing amount — lives on the Door ECS entity;
// this only reads it each frame and eases the hinge toward Door.open.
export function DoorLeaf({ door, snap, res }: Props) {
	const tex = useDungeonTextures();
	const pivot = useRef<THREE.Group>(null);

	const salt = door.variant * ARCH_SALT;
	const openHW = jitter(door.lc, door.lr, 1 + salt, TILE * 0.28, TILE * 0.38);
	const spring = jitter(door.lc, door.lr, 2 + salt, TILE * 0.95, TILE * 1.25);

	const geo = useMemo(() => makeLeaf(openHW, spring), [openHW, spring]);
	const tint = useMemo(() => new THREE.Color(...TINT.door), []);

	useFrame((_, dt) => {
		if (!pivot.current) return;
		const eid = doorEid(door.key);
		if (eid === undefined) return;
		const target = Door.locked[eid] ? 0 : 1;
		const a = 1 - Math.exp(-SWING_LERP * dt);
		Door.open[eid] += (target - Door.open[eid]) * a;
		pivot.current.rotation.y = Door.open[eid] * OPEN_ANGLE;
	});

	const cx = door.lc * TILE + HALF;
	const cz = door.lr * TILE + HALF;
	const yaw = door.axis === 'x' ? Math.PI / 2 : 0;

	return (
		<group position={[cx, 0, cz]} rotation={[0, yaw, 0]}>
			<group ref={pivot} position={[-openHW, 0, 0]}>
				<mesh geometry={geo} userData={{ kind: 'door' }}>
					<psxMaterial
						uMap={tex.door.color}
						uNormalMap={tex.door.normal}
						uHarMap={tex.door.har}
						uUseMaps={1}
						uPom={0}
						uSnap={snap}
						uAffine={0}
						uRes={res}
						uTint={tint}
						uOcclude={0}
						side={THREE.DoubleSide}
					/>
				</mesh>
			</group>
		</group>
	);
}
