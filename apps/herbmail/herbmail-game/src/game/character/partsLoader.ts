import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from './meshopt';
import type { PartSet } from './armor';

const SET_URL: Record<Exclude<PartSet, 'KNGT'>, string> = {
	SCFI09: '/models/parts/scifi-civ09.glb',
	SCFI10: '/models/parts/scifi-civ10.glb',
	HORR01: '/models/parts/horr-viln01.glb',
};

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<THREE.Object3D>>();

function loadSet(set: Exclude<PartSet, 'KNGT'>): Promise<THREE.Object3D> {
	let p = cache.get(set);
	if (!p) {
		p = loader.loadAsync(SET_URL[set]).then((g) => g.scene);
		cache.set(set, p);
	}
	return p;
}

export function preloadPartSets(): void {
	for (const set of Object.keys(SET_URL) as (keyof typeof SET_URL)[])
		void loadSet(set);
}

export async function attachPartSet(
	root: THREE.Object3D,
	set: PartSet,
): Promise<void> {
	if (set === 'KNGT') return;
	const src = await loadSet(set);
	const bones = new Map<string, THREE.Bone>();
	root.traverse((o) => {
		if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone);
	});
	const meshes: THREE.SkinnedMesh[] = [];
	src.traverse((o) => {
		if ((o as THREE.SkinnedMesh).isSkinnedMesh)
			meshes.push(o as THREE.SkinnedMesh);
	});

	const adopt = (b: THREE.Bone): THREE.Bone => {
		const existing = bones.get(b.name);
		if (existing) return existing;
		const nb = new THREE.Bone();
		nb.name = b.name;
		nb.position.copy(b.position);
		nb.quaternion.copy(b.quaternion);
		nb.scale.copy(b.scale);
		const parent =
			b.parent && (b.parent as THREE.Bone).isBone
				? adopt(b.parent as THREE.Bone)
				: root;
		parent.add(nb);
		bones.set(b.name, nb);
		return nb;
	};
	for (const m of meshes) {
		if (root.getObjectByName(m.name)) continue;
		const mapped = m.skeleton.bones.map(adopt);
		const clone = m.clone();
		clone.bind(
			new THREE.Skeleton(
				mapped as THREE.Bone[],
				m.skeleton.boneInverses.map((mx) => mx.clone()),
			),
			m.bindMatrix.clone(),
		);
		clone.castShadow = true;
		clone.frustumCulled = false;
		clone.visible = false;
		root.add(clone);
	}
}
