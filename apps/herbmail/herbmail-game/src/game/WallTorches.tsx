import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useTorches, type Torch } from './torches';
import { Flame } from './Flame';
const TORCH_URL = '/models/torch.glb';
useGLTF.preload(TORCH_URL);

const CULL_SQ = 12 * 12;
const SCALE = 1.1;
const HEAD_LOCAL = new THREE.Vector3(0, 0, 1);
const FLAME_COLOR = 0xff8a3c;

function prep(scene: THREE.Object3D): THREE.Object3D {
	const clone = scene.clone(true);
	clone.traverse((o) => {
		const mesh = o as THREE.Mesh;
		if (!mesh.isMesh) return;
		const src = mesh.material as THREE.MeshStandardMaterial;
		if (src.map) {
			src.map.magFilter = THREE.NearestFilter;
			src.map.minFilter = THREE.NearestMipmapNearestFilter;
			src.map.needsUpdate = true;
		}
		mesh.userData.kind = 'torch mount';
	});
	return clone;
}

interface FlameRef {
	light: THREE.PointLight;
	phase: number;
}

function TorchInstance({
	torch,
	base,
}: {
	torch: Torch;
	base: THREE.Object3D;
}) {
	const ref = useRef<FlameRef>({
		light: null as unknown as THREE.PointLight,
		phase: (torch.id * 12.9898) % (Math.PI * 2),
	});

	const quat = useMemo(() => {
		const dir = new THREE.Vector3(...torch.dir).normalize();
		return new THREE.Quaternion().setFromUnitVectors(HEAD_LOCAL, dir);
	}, [torch.dir]);

	const model = useMemo(() => {
		const m = prep(base);
		m.scale.setScalar(SCALE);
		m.position.z = SCALE;
		return m;
	}, [base]);

	const headPos = useMemo<[number, number, number]>(() => {
		const d = new THREE.Vector3(...torch.dir).normalize();
		return [
			torch.pos[0] + d.x * SCALE * 1.02,
			torch.pos[1] + d.y * SCALE * 1.02,
			torch.pos[2] + d.z * SCALE * 1.02,
		];
	}, [torch.pos, torch.dir]);

	useFrame((state) => {
		const r = ref.current;
		if (!r.light) return;
		const cam = state.camera;
		const dx = headPos[0] - cam.position.x;
		const dz = headPos[2] - cam.position.z;
		const lit = dx * dx + dz * dz < CULL_SQ;
		r.light.visible = lit;
		if (!lit) return;
		const t = state.clock.elapsedTime;
		const f =
			0.75 +
			0.15 * Math.sin(t * 11 + r.phase) +
			0.1 * Math.sin(t * 23.3 + r.phase * 2.1);
		r.light.intensity = 5.5 * f;
	});

	return (
		<>
			<group position={torch.pos} quaternion={quat}>
				<primitive object={model} />
			</group>
			<group position={headPos}>
				<Flame seed={(torch.id % 97) * 1.7} />
				<pointLight
					ref={(o) => (ref.current.light = o as THREE.PointLight)}
					color={FLAME_COLOR}
					intensity={5.5}
					distance={8}
					decay={2}
					position={[0, 0.28, 0]}
				/>
			</group>
		</>
	);
}

export function WallTorches() {
	const torches = useTorches();
	const gltf = useGLTF(TORCH_URL);

	return (
		<group>
			{torches.map((t) => (
				<TorchInstance key={t.id} torch={t} base={gltf.scene} />
			))}
		</group>
	);
}
