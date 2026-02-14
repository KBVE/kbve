import { describe, it, expect } from 'vitest';
import {
	isSharedArrayBufferAvailable,
	encodeToSharedBuffer,
	decodeFromSharedBuffer,
	toSharedArrayBuffer,
} from './shared-buffer';

describe('SharedArrayBuffer helpers', () => {
	it('should detect SharedArrayBuffer availability', () => {
		const available = isSharedArrayBufferAvailable();
		expect(typeof available).toBe('boolean');
	});

	it('should encode and decode a string via buffer', () => {
		const original = 'Hello, KhashVault!';
		const { buffer, byteLength } = encodeToSharedBuffer(original);

		expect(buffer).toBeDefined();
		expect(byteLength).toBeGreaterThan(0);

		const decoded = decodeFromSharedBuffer(buffer, byteLength);
		expect(decoded).toBe(original);
	});

	it('should handle empty string', () => {
		const { buffer, byteLength } = encodeToSharedBuffer('');
		expect(byteLength).toBe(0);
		const decoded = decodeFromSharedBuffer(buffer, byteLength);
		expect(decoded).toBe('');
	});

	it('should handle unicode content', () => {
		const original = 'Hello 🌍 World! Привет мир!';
		const { buffer, byteLength } = encodeToSharedBuffer(original);
		const decoded = decodeFromSharedBuffer(buffer, byteLength);
		expect(decoded).toBe(original);
	});

	it('should copy Uint8Array to buffer', () => {
		const original = new Uint8Array([1, 2, 3, 4, 5]);
		const { buffer } = toSharedArrayBuffer(original);
		const view = new Uint8Array(buffer);
		expect(view).toEqual(original);
	});
});
