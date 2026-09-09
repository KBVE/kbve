import type { GeoRequest, GeoResult } from './geoWorker';
import type { RoomDesc } from './generate';

// Owns the geometry worker and the in-flight request table. Kept separate from
// roomGeometry so that module stays testable in node, where Worker does not
// exist and `new URL(..., import.meta.url)` has nothing to resolve against.

type Ready = (r: GeoResult) => void;

let worker: Worker | null = null;
let nextId = 1;
const inFlight = new Map<number, string>();
const bySignature = new Map<string, number>();
let onReady: Ready = () => undefined;
let failed = false;

export function geoWorkerAvailable(): boolean {
	return !failed && typeof Worker !== 'undefined';
}

export function setGeoReadyHandler(cb: Ready): void {
	onReady = cb;
}

function ensure(): Worker | null {
	if (failed || typeof Worker === 'undefined') return null;
	if (worker) return worker;
	try {
		worker = new Worker(new URL('./geoWorker.ts', import.meta.url), {
			type: 'module',
		});
		worker.onmessage = (e: MessageEvent<GeoResult>) => {
			inFlight.delete(e.data.id);
			bySignature.delete(e.data.signature);
			onReady(e.data);
		};
		// A worker that dies must not strand the queue: fall back to building on
		// the main thread for the rest of the session rather than never producing
		// geometry at all.
		worker.onerror = (e) => {
			console.warn(
				'[geo] worker failed, building on main thread',
				e.message,
			);
			failed = true;
			worker?.terminate();
			worker = null;
			inFlight.clear();
			bySignature.clear();
		};
	} catch (err) {
		console.warn('[geo] worker unavailable, building on main thread', err);
		failed = true;
		worker = null;
	}
	return worker;
}

export function requestRoom(
	desc: RoomDesc,
	wantFloor: boolean,
	wantCeiling: boolean,
): boolean {
	const w = ensure();
	if (!w) return false;
	if (bySignature.has(desc.signature)) return true;
	const id = nextId++;
	inFlight.set(id, desc.signature);
	bySignature.set(desc.signature, id);
	const req: GeoRequest = { id, desc, wantFloor, wantCeiling };
	w.postMessage(req);
	return true;
}

export function isGeoInFlight(signature: string): boolean {
	return bySignature.has(signature);
}

// Dropping the claim (not the worker's work) so a room the player reached first
// is rebuilt on the main thread and the late result is discarded rather than
// overwriting a set already handed to the scene.
export function forgetGeoRequest(signature: string): void {
	const id = bySignature.get(signature);
	if (id !== undefined) {
		bySignature.delete(signature);
		inFlight.delete(id);
	}
}

export function geoBridgeStats(): {
	inFlight: number;
	failed: boolean;
	active: boolean;
} {
	return { inFlight: bySignature.size, failed, active: worker !== null };
}

export function stopGeoWorker(): void {
	worker?.terminate();
	worker = null;
	inFlight.clear();
	bySignature.clear();
}
