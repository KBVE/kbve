import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { getSimBridge } from './simBridge';
import { MAX_BODIES, FLOATS_PER_BODY } from './layout';
import { dungeonSpawn } from '../dungeon/collision';
import { useActiveRooms } from '../dungeon/store';
import { playerAnchor } from '../render/playerAnchor';
import { MODEL_URLS, MODEL_CRATE } from '../prop/kinds';

const CRATE_URL = MODEL_URLS[MODEL_CRATE];
const CRATE = 1.2;
const PANEL_T = 0.04;
const KIND_PANEL = 2;

useGLTF.preload(CRATE_URL);

// Renders the break-off panels from destroyed crates: the crate stays a main-thread
// ECS prop, but on break the worker spawns its six face panels (kind 2 in the shared
// transform block) which fall + tumble here. Also feeds the player pose in (panels
// bounce off the player) and streams per-sector static colliders for them to land on.
export function PhysicsBodies() {
	const panelRef = useRef<THREE.InstancedMesh>(null);
	const bridge = useMemo(() => getSimBridge(), []);
	const rooms = useActiveRooms();
	const known = useRef<Set<string>>(new Set());
	const p = useMemo(() => new THREE.Vector3(), []);
	const q = useMemo(() => new THREE.Quaternion(), []);
	const one = useMemo(() => new THREE.Vector3(1, 1, 1), []);
	const m = useMemo(() => new THREE.Matrix4(), []);

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

		const panel = panelRef.current;
		if (!panel) return;
		const buf = bridge.bodies;
		let pi = 0;
		for (let i = 0; i < MAX_BODIES; i++) {
			const b = i * FLOATS_PER_BODY;
			if (buf[b + 7] !== KIND_PANEL) continue;
			p.set(buf[b], buf[b + 1], buf[b + 2]);
			q.set(buf[b + 3], buf[b + 4], buf[b + 5], buf[b + 6]);
			m.compose(p, q, one);
			panel.setMatrixAt(pi++, m);
		}
		panel.count = pi;
		panel.instanceMatrix.needsUpdate = true;
	});

	return (
		<instancedMesh
			ref={panelRef}
			args={[undefined, undefined, MAX_BODIES]}
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
