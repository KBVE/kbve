import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { getSimBridge } from './simBridge';
import { MAX_INSTANCES, INST_COUNT } from '../mecs/schema';
import { dungeonSpawn } from '../dungeon/collision';
import { useActiveRooms } from '../dungeon/store';
import { playerAnchor } from '../render/playerAnchor';
import { MODEL_URLS, MODEL_CRATE } from '../prop/kinds';

const CRATE_URL = MODEL_URLS[MODEL_CRATE];
const CRATE = 1.2;
const PANEL_T = 0.04;

useGLTF.preload(CRATE_URL);

// Renders the worker's simulated bodies (break-off crate panels) straight from the
// shared instance buffer: the worker packs a dense AoS mat4 per body, and this
// InstancedMesh binds that SharedArrayBuffer view AS its instanceMatrix, so each
// frame is one needsUpdate (bufferSubData) — no per-body compose, no postMessage.
// Also feeds the player pose in (bodies bounce off the player) and streams
// per-sector static colliders for them to land on.
export function PhysicsBodies() {
	const meshRef = useRef<THREE.InstancedMesh>(null);
	const bridge = useMemo(() => getSimBridge(), []);
	const rooms = useActiveRooms();
	const known = useRef<Set<string>>(new Set());

	const gltf = useGLTF(CRATE_URL);
	const map = useMemo(() => {
		let found: THREE.Texture | null = null;
		gltf.scene.traverse((o) => {
			const mesh = o as THREE.Mesh;
			const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
			if (mesh.isMesh && mat?.map && !found) found = mat.map;
		});
		return found;
	}, [gltf]);

	useEffect(() => {
		const [ox, , oz] = dungeonSpawn();
		bridge.start({ ox, oz });
		return () => bridge.stop();
	}, [bridge]);

	// Bind the SAB mat4 rows directly as the instance matrix (zero-copy upload path).
	useEffect(() => {
		const mesh = meshRef.current;
		if (!mesh) return;
		const attr = new THREE.InstancedBufferAttribute(
			bridge.instance.matrices,
			16,
		);
		attr.setUsage(THREE.DynamicDrawUsage);
		mesh.instanceMatrix = attr;
		mesh.count = 0;
	}, [bridge]);

	useEffect(() => {
		const next = new Set(rooms.map((r) => r.key));
		for (const r of rooms) {
			if (known.current.has(r.key)) continue;
			bridge.addSector({
				key: r.key,
				tiles: r.desc.tiles,
				cols: r.desc.cols,
				rows: r.desc.rows,
				originCol: r.desc.originCol,
				originRow: r.desc.originRow,
			});
		}
		for (const key of known.current)
			if (!next.has(key)) bridge.removeSector(key);
		known.current = next;
	}, [bridge, rooms]);

	useFrame(() => {
		bridge.player[0] = playerAnchor.pos.x;
		bridge.player[1] = playerAnchor.pos.y;
		bridge.player[2] = playerAnchor.pos.z;

		const mesh = meshRef.current;
		if (!mesh) return;
		mesh.count = bridge.instance.header[INST_COUNT];
		mesh.instanceMatrix.needsUpdate = true;
	});

	return (
		<instancedMesh
			ref={meshRef}
			args={[undefined, undefined, MAX_INSTANCES]}
			castShadow
			frustumCulled={false}>
			<boxGeometry args={[CRATE, CRATE, PANEL_T]} />
			<meshStandardMaterial
				map={map ?? undefined}
				color={map ? '#ffffff' : '#b5793f'}
				roughness={0.85}
			/>
		</instancedMesh>
	);
}
