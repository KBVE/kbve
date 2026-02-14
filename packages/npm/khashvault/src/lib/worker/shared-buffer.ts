/**
 * SharedArrayBuffer utilities for zero-copy data transfer between
 * main thread and worker threads.
 *
 * Requires Cross-Origin Isolation (COOP/COEP headers) for SharedArrayBuffer.
 * Falls back to standard ArrayBuffer when unavailable.
 */

/**
 * Check if SharedArrayBuffer is available (requires cross-origin isolation).
 */
export function isSharedArrayBufferAvailable(): boolean {
	return typeof SharedArrayBuffer !== 'undefined';
}

/**
 * Check if the current context is cross-origin isolated.
 */
export function isCrossOriginIsolated(): boolean {
	return (
		typeof globalThis.crossOriginIsolated !== 'undefined' &&
		globalThis.crossOriginIsolated
	);
}

/**
 * Encode a string into a SharedArrayBuffer for zero-copy transfer.
 * Falls back to a regular ArrayBuffer if SharedArrayBuffer is unavailable.
 */
export function encodeToSharedBuffer(data: string): {
	buffer: SharedArrayBuffer | ArrayBuffer;
	byteLength: number;
	shared: boolean;
} {
	const encoded = new TextEncoder().encode(data);

	if (isSharedArrayBufferAvailable()) {
		const sab = new SharedArrayBuffer(encoded.byteLength);
		const view = new Uint8Array(sab);
		view.set(encoded);
		return { buffer: sab, byteLength: encoded.byteLength, shared: true };
	}

	return {
		buffer: encoded.buffer as ArrayBuffer,
		byteLength: encoded.byteLength,
		shared: false,
	};
}

/**
 * Decode a SharedArrayBuffer (or ArrayBuffer) back to a string.
 */
export function decodeFromSharedBuffer(
	buffer: SharedArrayBuffer | ArrayBuffer,
	byteLength: number,
): string {
	const view = new Uint8Array(buffer, 0, byteLength);
	return new TextDecoder().decode(view);
}

/**
 * Copy a Uint8Array into a SharedArrayBuffer for zero-copy transfer.
 * Falls back to a regular ArrayBuffer copy if SharedArrayBuffer is unavailable.
 */
export function toSharedArrayBuffer(bytes: Uint8Array): {
	buffer: SharedArrayBuffer | ArrayBuffer;
	shared: boolean;
} {
	if (isSharedArrayBufferAvailable()) {
		const sab = new SharedArrayBuffer(bytes.byteLength);
		const view = new Uint8Array(sab);
		view.set(bytes);
		return { buffer: sab, shared: true };
	}

	const ab = new ArrayBuffer(bytes.byteLength);
	const view = new Uint8Array(ab);
	view.set(bytes);
	return { buffer: ab, shared: false };
}
