import * as THREE from 'three';
import { EntityPool, MeshRef, Transform3 } from '@kbve/laser/ecs';
import { TORCH_HEAD_LOCAL, TORCH_MODEL_SCALE } from '../prop/torchModel';

const SCALE = TORCH_MODEL_SCALE;
const HEAD_LOCAL = TORCH_HEAD_LOCAL;

// Wooden ring bracket at the torch base where it meets the wall. Shared geometry
// + material across every torch (never per-torch disposed — see disposeObject).
const woodTex = new THREE.TextureLoader().load('/textures/wood_14_256_.png');
woodTex.magFilter = THREE.NearestFilter;
woodTex.minFilter = THREE.NearestMipmapNearestFilter;
woodTex.wrapS = THREE.RepeatWrapping;
woodTex.wrapT = THREE.RepeatWrapping;
woodTex.colorSpace = THREE.SRGBColorSpace;
const HOLDER_GEO = new THREE.TorusGeometry(0.16, 0.055, 6, 12);
const HOLDER_MAT = new THREE.MeshStandardMaterial({
	map: woodTex,
	roughness: 1,
});

function makeHolder(): THREE.Mesh {
	const ring = new THREE.Mesh(HOLDER_GEO, HOLDER_MAT);
	ring.position.z = 0.3;
	ring.userData.shared = true;
	return ring;
}

function prep(base: THREE.Object3D): THREE.Object3D {
	const clone = base.clone(true);
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

function disposeObject(obj: THREE.Object3D): void {
	obj.traverse((o) => {
		const mesh = o as THREE.Mesh;
		if (mesh.isMesh && !mesh.userData.shared) mesh.geometry?.dispose();
	});
}

// GLB clone pool keyed by MeshRef prop entities. Torches don't move, so meshes
// are placed once at create() from the Transform3 mount transform and only added
// / removed as rooms stream in and out.
export class MeshPool extends EntityPool<THREE.Object3D> {
	readonly root = new THREE.Group();

	constructor(private readonly models: THREE.Object3D[]) {
		super([MeshRef, Transform3]);
	}

	protected create(eid: number): THREE.Object3D {
		const base = this.models[MeshRef.modelId[eid]];
		const model = prep(base);
		model.scale.setScalar(SCALE);
		model.position.z = SCALE;

		const group = new THREE.Group();
		group.position.set(
			Transform3.px[eid],
			Transform3.py[eid],
			Transform3.pz[eid],
		);
		const dir = new THREE.Vector3(
			Transform3.dx[eid],
			Transform3.dy[eid],
			Transform3.dz[eid],
		).normalize();
		group.quaternion.setFromUnitVectors(HEAD_LOCAL, dir);
		group.add(model);
		group.add(makeHolder());
		group.traverse((o) => (o.userData.eid = eid));

		this.root.add(group);
		return group;
	}

	protected destroy(item: THREE.Object3D): void {
		this.root.remove(item);
		disposeObject(item);
	}
}
