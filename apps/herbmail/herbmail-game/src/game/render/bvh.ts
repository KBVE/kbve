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

// Eager BVH on a streamed sector means ~200 tiny computeBoundsTree calls in the
// mount frame — that is the 60->30 hitch. Nothing needs the tree that frame:
// movement collision samples the tile grid off-thread, and the 20 Hz aim ray
// falls back to uncached raycast until the tree attaches. So chunks queue here
// and drain on idle, each routed through buildBVH (worker path for >10k tris).
type IdleDeadlineLike = { timeRemaining(): number };

const bvhQueue: THREE.BufferGeometry[] = [];
let draining = false;

const scheduleIdle: (cb: (d?: IdleDeadlineLike) => void) => void =
	typeof requestIdleCallback === 'function'
		? (cb) =>
				requestIdleCallback(cb as IdleRequestCallback, { timeout: 200 })
		: (cb) => setTimeout(() => cb(), 1);

export function queueBVH(geometry: THREE.BufferGeometry): void {
	if (geometry.userData.bvhPending) return;
	geometry.userData.bvhPending = true;
	bvhQueue.push(geometry);
	if (!draining) {
		draining = true;
		scheduleIdle(drainBVH);
	}
}

export function cancelBVH(geometry: THREE.BufferGeometry): void {
	if (!geometry.userData.bvhPending) return;
	geometry.userData.bvhPending = false;
	// Drop it now rather than leaving a tombstone for the drain to skip: callers
	// cancel from disposeSet, which disposes the geometry immediately after, and
	// on a slow machine the queue can sit thousands deep for a minute — every
	// stale entry is a disposed BufferGeometry held live for that whole time.
	const i = bvhQueue.indexOf(geometry);
	if (i >= 0) bvhQueue.splice(i, 1);
}

let builtCount = 0;
let builtMs = 0;

export function bvhStats(): {
	depth: number;
	built: number;
	ms: number;
	draining: boolean;
} {
	return {
		depth: bvhQueue.length,
		built: builtCount,
		ms: +builtMs.toFixed(1),
		draining,
	};
}

// Module-level and ungated: the queue only exists during the load burst, before
// the debug HUD has mounted, and FrameProbe resets its delta baseline when the
// scene remounts — so neither can see the drain that matters. This is the only
// vantage point that covers it, and the failure it guards against (a queue that
// stops draining) bites hardest on slow machines, which are production ones.
(globalThis as Record<string, unknown>).__bvh = { stats: bvhStats };

// Floor on progress per callback. An idle deadline only means anything while
// the callback runs synchronously: buildBVH awaits, so by the time it resolves
// the idle period has passed and timeRemaining() reads ~0. Checking it after
// the await let exactly one chunk through per callback, and on a machine with
// no idle to spare that is ~5 chunks a second against a queue thousands deep —
// measured at 6x CPU throttle, 162 of 1058 built after 48 seconds, still
// draining. Budget against our own clock instead, and take the idle deadline
// only when it offers more than the floor.
const DRAIN_BUDGET_MS = 2;
const DEEP_QUEUE = 400;
const DEEP_BUDGET_MS = 6;

async function drainBVH(deadline?: IdleDeadlineLike): Promise<void> {
	const t0 = performance.now();
	const floor =
		bvhQueue.length > DEEP_QUEUE ? DEEP_BUDGET_MS : DRAIN_BUDGET_MS;
	const budget = deadline ? Math.max(deadline.timeRemaining(), floor) : floor;
	try {
		while (bvhQueue.length) {
			const geo = bvhQueue.shift()!;
			if (!geo.userData.bvhPending || !geo.attributes.position) continue;
			const s0 = performance.now();
			await buildBVH(geo);
			builtMs += performance.now() - s0;
			builtCount++;
			geo.userData.bvhPending = false;
			if (performance.now() - t0 >= budget) break;
		}
	} catch (err) {
		// One bad geometry must not end the chain: the scheduler only re-arms
		// from here, so throwing out of this callback stranded every remaining
		// chunk on the uncached raycast path with no way to recover.
		console.warn('[bvh] build failed, continuing drain', err);
	} finally {
		if (bvhQueue.length) scheduleIdle(drainBVH);
		else draining = false;
	}
}
