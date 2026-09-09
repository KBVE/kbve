// Cross-origin isolation gates SharedArrayBuffer. When it's on (COOP/COEP headers
// or the coi-serviceworker), we can share memory zero-copy with a worker and the
// GPU; when it's off (e.g. an embed without the headers) we degrade to a plain
// ArrayBuffer and run the sim on the main thread. The `& flag` / typed-array logic
// is identical either way, so nothing downstream cares which backing it got.
export const isCrossOriginIsolated =
	typeof globalThis.crossOriginIsolated === 'boolean'
		? globalThis.crossOriginIsolated
		: false;

export const hasSharedMemory =
	isCrossOriginIsolated && typeof SharedArrayBuffer !== 'undefined';

// Allocate a buffer that is shareable when possible, plain otherwise. Atomics work
// on both, so callers use the same code path regardless.
export function makeBuffer(bytes: number): SharedArrayBuffer | ArrayBuffer {
	return hasSharedMemory
		? new SharedArrayBuffer(bytes)
		: new ArrayBuffer(bytes);
}

export function isolationReport(): string {
	return `crossOriginIsolated=${isCrossOriginIsolated} SharedArrayBuffer=${
		typeof SharedArrayBuffer !== 'undefined'
	} sharedMemory=${hasSharedMemory}`;
}
