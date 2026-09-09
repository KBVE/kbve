import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { toPayload, fromPayload, transfersOf } from './geoTransfer';

function sample(): THREE.BufferGeometry {
	const g = new THREE.BufferGeometry();
	g.setAttribute(
		'position',
		new THREE.BufferAttribute(
			new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]),
			3,
		),
	);
	g.setAttribute(
		'normal',
		new THREE.BufferAttribute(
			new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
			3,
		),
	);
	g.setAttribute(
		'uv',
		new THREE.BufferAttribute(
			new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
			2,
		),
	);
	g.setIndex(
		new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 2, 1, 3]), 1),
	);
	return g;
}

describe('geoTransfer', () => {
	it('round-trips every attribute and the index', () => {
		const src = sample();
		const out = fromPayload(toPayload(src));
		for (const name of ['position', 'normal', 'uv']) {
			expect(Array.from(out.attributes[name].array)).toEqual(
				Array.from(src.attributes[name].array),
			);
			expect(out.attributes[name].itemSize).toBe(
				src.attributes[name].itemSize,
			);
		}
		expect(Array.from(out.index!.array)).toEqual(
			Array.from(src.index!.array),
		);
	});

	it('preserves index integer width', () => {
		const g = sample();
		g.setIndex(new THREE.BufferAttribute(new Uint32Array([0, 1, 2]), 1));
		expect(fromPayload(toPayload(g)).index!.array).toBeInstanceOf(
			Uint32Array,
		);
		expect(fromPayload(toPayload(sample())).index!.array).toBeInstanceOf(
			Uint16Array,
		);
	});

	// A geometry with no index is normal for the diced chunks, so it must not
	// be treated as a malformed payload.
	it('handles geometry without an index', () => {
		const g = sample();
		g.setIndex(null);
		const out = fromPayload(toPayload(g));
		expect(out.index).toBeNull();
		expect(out.attributes.position.count).toBe(4);
	});

	// Attributes that view part of a larger buffer must be copied out, not
	// handed over whole: transferring the shared backing store would detach it
	// from every other attribute still using it.
	it('copies out attributes that are views into a shared buffer', () => {
		const backing = new Float32Array([0, 0, 0, 1, 1, 1, 2, 2, 2, 9, 9, 9]);
		const g = new THREE.BufferGeometry();
		g.setAttribute(
			'position',
			new THREE.BufferAttribute(backing.subarray(0, 9), 3),
		);
		const p = toPayload(g);
		expect(p.attrs.position.array.byteLength).toBe(9 * 4);
		expect(Array.from(fromPayload(p).attributes.position.array)).toEqual([
			0, 0, 0, 1, 1, 1, 2, 2, 2,
		]);
	});

	it('lists each buffer once for the transfer list', () => {
		const list = transfersOf([toPayload(sample()), toPayload(sample())]);
		expect(new Set(list).size).toBe(list.length);
		expect(list.every((b) => b instanceof ArrayBuffer)).toBe(true);
		// 3 attributes + 1 index, twice.
		expect(list.length).toBe(8);
	});

	it('rejects array types it cannot faithfully reproduce', () => {
		const g = new THREE.BufferGeometry();
		g.setAttribute(
			'position',
			new THREE.BufferAttribute(new Int16Array([0, 1, 2]), 3),
		);
		expect(() => toPayload(g)).toThrow(/unsupported array/);
	});
});
