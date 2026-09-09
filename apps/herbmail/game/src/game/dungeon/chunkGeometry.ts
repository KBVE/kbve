import * as THREE from 'three';
import { TILE } from '../config';

export const CHUNK_TILES = 8;
export const CHUNK_WORLD = CHUNK_TILES * TILE;

interface Bucket {
	arrays: Map<string, number[]>;
}

export function chunkGeometry(
	geo: THREE.BufferGeometry,
	chunkWorld = CHUNK_WORLD,
): THREE.BufferGeometry[] {
	if (!geo.attributes.position) return [];
	const flat = geo.index ? geo.toNonIndexed() : geo;
	const pos = flat.attributes.position as THREE.BufferAttribute;
	const names = Object.keys(flat.attributes);
	const triCount = pos.count / 3;

	const buckets = new Map<string, Bucket>();
	const bucketFor = (key: string): Bucket => {
		let b = buckets.get(key);
		if (!b) {
			b = { arrays: new Map(names.map((n) => [n, []])) };
			buckets.set(key, b);
		}
		return b;
	};

	for (let t = 0; t < triCount; t++) {
		const a = t * 3;
		const cx = (pos.getX(a) + pos.getX(a + 1) + pos.getX(a + 2)) / 3;
		const cz = (pos.getZ(a) + pos.getZ(a + 1) + pos.getZ(a + 2)) / 3;
		const key = `${Math.floor(cx / chunkWorld)}|${Math.floor(cz / chunkWorld)}`;
		const b = bucketFor(key);
		for (const n of names) {
			const attr = flat.attributes[n] as THREE.BufferAttribute;
			const size = attr.itemSize;
			const dst = b.arrays.get(n)!;
			for (let v = 0; v < 3; v++) {
				const vi = a + v;
				for (let c = 0; c < size; c++)
					dst.push(attr.getComponent(vi, c));
			}
		}
	}

	if (flat !== geo) flat.dispose();

	const out: THREE.BufferGeometry[] = [];
	for (const b of buckets.values()) {
		const cg = new THREE.BufferGeometry();
		for (const n of names) {
			const size = (geo.attributes[n] as THREE.BufferAttribute).itemSize;
			cg.setAttribute(
				n,
				new THREE.Float32BufferAttribute(b.arrays.get(n)!, size),
			);
		}
		cg.computeBoundingSphere();
		out.push(cg);
	}
	return out;
}
