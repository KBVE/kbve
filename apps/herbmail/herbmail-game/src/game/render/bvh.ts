import * as THREE from 'three';
import {
	acceleratedRaycast,
	computeBoundsTree,
	disposeBoundsTree,
} from 'three-mesh-bvh';

THREE.BufferGeometry.prototype.computeBoundsTree =
	computeBoundsTree as unknown as typeof THREE.BufferGeometry.prototype.computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// Sync builds block the frame; fine for diced room chunks (~1-2k tris,
// sub-ms) but a 100k-tri GLB would hitch. Above the threshold the tree is
// built on a worker (lazy-loaded, ParallelMeshBVHWorker rides the SAB the
// game already requires) and attached when ready — raycasts against the
// mesh just take the uncached path until then.
const WORKER_THRESHOLD_TRIS = 10_000;

interface BVHWorkerLike {
	generate(
		geometry: THREE.BufferGeometry,
	): Promise<THREE.BufferGeometry['boundsTree']>;
}

let workerPromise: Promise<BVHWorkerLike> | null = null;

function getWorker(): Promise<BVHWorkerLike> {
	if (!workerPromise) {
		workerPromise = import('three-mesh-bvh/worker').then(
			(m) => new m.ParallelMeshBVHWorker() as unknown as BVHWorkerLike,
		);
	}
	return workerPromise;
}

export async function buildBVH(geometry: THREE.BufferGeometry): Promise<void> {
	const pos = geometry.attributes.position;
	if (!pos) return;
	const tris = (geometry.index ? geometry.index.count : pos.count) / 3;
	if (tris <= WORKER_THRESHOLD_TRIS) {
		geometry.computeBoundsTree();
		return;
	}
	const worker = await getWorker();
	geometry.boundsTree = await worker.generate(geometry);
}
