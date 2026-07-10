import { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { type Torch } from './torches';
import { useDungeonTorches } from './dungeon/torchList';
import { Flame } from './Flame';

const TORCH_URL = '/models/torch.glb';
useGLTF.preload(TORCH_URL);

const SCALE = 1.1;
const HEAD_LOCAL = new THREE.Vector3(0, 0, 1);

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

function TorchInstance({ torch, base }: { torch: Torch; base: THREE.Object3D }) {
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

	return (
		<>
			<group position={torch.pos} quaternion={quat}>
				<primitive object={model} />
			</group>
			<group position={headPos}>
				<Flame seed={(torch.id % 97) * 1.7} />
			</group>
		</>
	);
}

export function WallTorches() {
	const torches = useDungeonTorches();
	const gltf = useGLTF(TORCH_URL);

	return (
		<group>
			{torches.map((t) => (
				<TorchInstance
					key={`${t.cx}|${t.cy}|${t.id}`}
					torch={t}
					base={gltf.scene}
				/>
			))}
		</group>
	);
}
