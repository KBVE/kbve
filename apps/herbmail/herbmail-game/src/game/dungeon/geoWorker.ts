import {
	buildArches,
	buildTrims,
	buildBays,
	buildCeiling,
	buildCeilingWithHoles,
	buildOasisDomes,
	buildCornerCoves,
	buildCoves,
	buildFloor,
	buildFloorWithHoles,
	buildWalls,
	buildColumns,
} from '../geometry';
import { makeLocalGrid, type RoomDesc } from './generate';
import { toPayload, transfersOf, type GeoPayload } from './geoTransfer';

// Room geometry runs here rather than on the main thread. The builders are pure
// mesh maths over three's geometry classes — BufferGeometry, ExtrudeGeometry,
// LatheGeometry, Shape/Path, Matrix4 — none of which touch a renderer, a
// texture or the DOM, so they run in a worker unchanged.
//
// What stays on the main thread is everything that needs GPU or scene context:
// dicing into chunks, the bake pool, BVH queueing, and the shared floor/ceiling
// singletons. This only moves the arithmetic.

export interface GeoRequest {
	id: number;
	desc: RoomDesc;
	// Rooms that bake get their own floor/ceiling slab; the ones that do not
	// share a singleton the main thread already holds, so building them here
	// would be wasted work and a wasted transfer.
	wantFloor: boolean;
	wantCeiling: boolean;
}

export interface GeoResult {
	id: number;
	signature: string;
	walls: GeoPayload[];
	columns: GeoPayload[];
	floor: GeoPayload | null;
	ceiling: GeoPayload | null;
	arch: GeoPayload;
	trim: GeoPayload;
	cove: GeoPayload;
	corner: GeoPayload;
	domes: GeoPayload | null;
	bayFrames: GeoPayload;
	bayBacks: GeoPayload;
}

export function buildRoom(req: GeoRequest): {
	result: GeoResult;
	transfer: ArrayBuffer[];
} {
	const { desc } = req;
	const g = makeLocalGrid(desc);
	const v = desc.variant;

	const walls = buildWalls(g, v).map(toPayload);
	const columns = buildColumns(desc.columns).map(toPayload);
	const arch = toPayload(buildArches(g, v));
	const trim = toPayload(buildTrims(g, v));
	const cove = toPayload(buildCoves(g));
	const corner = toPayload(buildCornerCoves(g, v));
	const domes = desc.oases.length
		? toPayload(buildOasisDomes(g, desc.oases))
		: null;
	const bays = buildBays(g, v);
	const bayFrames = toPayload(bays.frames);
	const bayBacks = toPayload(bays.backs);

	const floor = req.wantFloor
		? toPayload(desc.oases.length ? buildFloorWithHoles(g) : buildFloor(g))
		: null;
	const ceiling = req.wantCeiling
		? toPayload(
				desc.oases.length ? buildCeilingWithHoles(g) : buildCeiling(g),
			)
		: null;

	const result: GeoResult = {
		id: req.id,
		signature: desc.signature,
		walls,
		columns,
		floor,
		ceiling,
		arch,
		trim,
		cove,
		corner,
		domes,
		bayFrames,
		bayBacks,
	};

	const all = [
		...walls,
		...columns,
		arch,
		trim,
		cove,
		corner,
		bayFrames,
		bayBacks,
	];
	if (floor) all.push(floor);
	if (ceiling) all.push(ceiling);
	if (domes) all.push(domes);

	return { result, transfer: transfersOf(all) };
}

// globalThis rather than self, matching bakeWorker: `self` is a restricted
// global in this workspace. Guarded so buildRoom stays importable from tests,
// where there is no worker scope to install a handler on.
const ctx = globalThis as unknown as Worker;

if (typeof ctx.postMessage === 'function' && !('document' in globalThis)) {
	ctx.onmessage = (e: MessageEvent<GeoRequest>) => {
		const { result, transfer } = buildRoom(e.data);
		ctx.postMessage(result, transfer);
	};
}
