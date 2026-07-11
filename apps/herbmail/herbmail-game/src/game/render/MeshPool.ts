import * as THREE from 'three';
import { EntityPool, MeshRef, Transform3 } from '@kbve/laser/ecs';

const SCALE = 1.1;
const HEAD_LOCAL = new THREE.Vector3(0, 0, 1);

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
		if (mesh.isMesh) mesh.geometry?.dispose();
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

		this.root.add(group);
		return group;
	}

	protected destroy(item: THREE.Object3D): void {
		this.root.remove(item);
		disposeObject(item);
	}
}
