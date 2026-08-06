import * as THREE from 'three';

// Geometry crosses the worker boundary as raw typed arrays. BufferGeometry
// itself is not cloneable — it carries prototypes, a uuid and cached bounding
// volumes — but every attribute underneath it is a typed array over an
// ArrayBuffer, which transfers with no copy at all.

export interface AttrPayload {
	array: ArrayBuffer;
	kind: 'f32' | 'u32' | 'u16';
	itemSize: number;
	normalized: boolean;
}

export interface GeoPayload {
	attrs: Record<string, AttrPayload>;
	index: AttrPayload | null;
}

function kindOf(a: ArrayBufferView): AttrPayload['kind'] {
	if (a instanceof Float32Array) return 'f32';
	if (a instanceof Uint32Array) return 'u32';
	if (a instanceof Uint16Array) return 'u16';
	throw new Error(`geoTransfer: unsupported array ${a.constructor.name}`);
}

function viewOf(p: AttrPayload): THREE.TypedArray {
	if (p.kind === 'f32') return new Float32Array(p.array);
	if (p.kind === 'u32') return new Uint32Array(p.array);
	return new Uint16Array(p.array);
}

// The attribute may be a view over a larger buffer (three's interleaved and
// sliced attributes are), so the exact byte range is copied out rather than
// handing over the whole backing store — transferring that would detach data
// another attribute is still using.
function packAttr(a: THREE.BufferAttribute): AttrPayload {
	const src = a.array as ArrayBufferView & {
		slice(a: number, b: number): unknown;
	};
	const exact =
		src.byteOffset === 0 && src.byteLength === src.buffer.byteLength
			? (src.buffer as ArrayBuffer)
			: ((
					src.slice(
						0,
						(src as unknown as { length: number }).length,
					) as ArrayBufferView
				).buffer as ArrayBuffer);
	return {
		array: exact,
		kind: kindOf(a.array as ArrayBufferView),
		itemSize: a.itemSize,
		normalized: a.normalized,
	};
}

export function toPayload(geo: THREE.BufferGeometry): GeoPayload {
	const attrs: Record<string, AttrPayload> = {};
	for (const name of Object.keys(geo.attributes)) {
		attrs[name] = packAttr(geo.attributes[name] as THREE.BufferAttribute);
	}
	return { attrs, index: geo.index ? packAttr(geo.index) : null };
}

export function fromPayload(p: GeoPayload): THREE.BufferGeometry {
	const geo = new THREE.BufferGeometry();
	for (const name of Object.keys(p.attrs)) {
		const a = p.attrs[name];
		geo.setAttribute(
			name,
			new THREE.BufferAttribute(viewOf(a), a.itemSize, a.normalized),
		);
	}
	if (p.index) geo.setIndex(new THREE.BufferAttribute(viewOf(p.index), 1));
	return geo;
}

// Every ArrayBuffer in the payload, for postMessage's transfer list. Collected
// through a Set because two attributes can legitimately share a buffer and
// listing one twice is a DataCloneError.
export function transfersOf(payloads: GeoPayload[]): ArrayBuffer[] {
	const out = new Set<ArrayBuffer>();
	for (const p of payloads) {
		for (const name of Object.keys(p.attrs)) out.add(p.attrs[name].array);
		if (p.index) out.add(p.index.array);
	}
	return [...out];
}
