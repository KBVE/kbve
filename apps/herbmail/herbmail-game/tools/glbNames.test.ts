import { describe, it, expect } from 'vitest';
import {
	meshNodeNames,
	readGltfJson,
	restoreMeshNames,
	type GltfJson,
} from './glbNames';

function buildGlb(gltf: GltfJson, binData = Buffer.from('BINARYDATA')): Buffer {
	let json = Buffer.from(JSON.stringify(gltf), 'utf8');
	const jsonPad = (4 - (json.length % 4)) % 4;
	if (jsonPad) json = Buffer.concat([json, Buffer.alloc(jsonPad, 0x20)]);
	let bin = binData;
	const binPad = (4 - (bin.length % 4)) % 4;
	if (binPad) bin = Buffer.concat([bin, Buffer.alloc(binPad, 0)]);
	const jsonChunk = Buffer.alloc(8);
	jsonChunk.writeUInt32LE(json.length, 0);
	jsonChunk.write('JSON', 4, 'latin1');
	const binChunk = Buffer.alloc(8);
	binChunk.writeUInt32LE(bin.length, 0);
	binChunk.write('BIN\0', 4, 'latin1');
	const header = Buffer.alloc(12);
	header.write('glTF', 0, 'latin1');
	header.writeUInt32LE(2, 4);
	header.writeUInt32LE(
		12 + jsonChunk.length + json.length + binChunk.length + bin.length,
		8,
	);
	return Buffer.concat([header, jsonChunk, json, binChunk, bin]);
}

function chunksValid(glb: Buffer): boolean {
	if (glb.readUInt32LE(8) !== glb.length) return false;
	let off = 12;
	while (off < glb.length) {
		const len = glb.readUInt32LE(off);
		if (len % 4 !== 0) return false;
		off += 8 + len;
	}
	return off === glb.length;
}

// The shape gltfpack emits: the slot name stays on a wrapper node and the mesh
// moves to a fresh unnamed child.
const packed: GltfJson = {
	nodes: [
		{ name: 'SKIN_TORS', children: [1] },
		{ mesh: 0 },
		{ name: 'TORS', children: [3] },
		{ mesh: 1 },
		{ name: 'Armature', children: [0, 2] },
	],
};

describe('restoreMeshNames', () => {
	it('moves the slot name onto the node that carries the mesh', () => {
		const { glb, moved } = restoreMeshNames(buildGlb(packed));
		expect(moved).toBe(2);
		expect(meshNodeNames(glb)).toEqual(new Set(['SKIN_TORS', 'TORS']));
	});

	it('clears the name off the wrapper so no duplicates remain', () => {
		const { glb } = restoreMeshNames(buildGlb(packed));
		const names = (readGltfJson(glb).nodes ?? [])
			.map((n) => n.name)
			.filter(Boolean);
		expect(names).toEqual([...new Set(names)]);
	});

	it('keeps the GLB structurally valid after the JSON rewrite', () => {
		const { glb } = restoreMeshNames(buildGlb(packed));
		expect(chunksValid(glb)).toBe(true);
		expect(glb.subarray(0, 4).toString('latin1')).toBe('glTF');
	});

	it('preserves the BIN chunk byte for byte', () => {
		const bin = Buffer.from('MESHOPT-PAYLOAD!');
		const { glb } = restoreMeshNames(buildGlb(packed, bin));
		expect(glb.subarray(glb.length - bin.length)).toEqual(bin);
	});

	it('is a no-op on an already-named rig (the dev shape)', () => {
		const dev = buildGlb({
			nodes: [
				{ name: 'SKIN_TORS', mesh: 0 },
				{ name: 'Armature', children: [0] },
			],
		});
		const { glb, moved } = restoreMeshNames(dev);
		expect(moved).toBe(0);
		expect(glb).toEqual(dev);
	});

	it('is idempotent', () => {
		const once = restoreMeshNames(buildGlb(packed));
		const twice = restoreMeshNames(once.glb);
		expect(twice.moved).toBe(0);
		expect(meshNodeNames(twice.glb)).toEqual(meshNodeNames(once.glb));
	});

	it('leaves a wrapper alone when it has siblings to disambiguate', () => {
		const shared: GltfJson = {
			nodes: [
				{ name: 'GROUP', children: [1, 2] },
				{ mesh: 0 },
				{ mesh: 1 },
			],
		};
		const { glb, moved } = restoreMeshNames(buildGlb(shared));
		expect(moved).toBe(0);
		expect(readGltfJson(glb).nodes?.[0].name).toBe('GROUP');
	});

	it('leaves a wrapper alone when it carries a mesh of its own', () => {
		const both: GltfJson = {
			nodes: [
				{ name: 'HOLDER', mesh: 0, children: [1] },
				{ mesh: 1 },
			],
		};
		const { moved } = restoreMeshNames(buildGlb(both));
		expect(moved).toBe(0);
	});

	it('ignores a mesh node with no parent', () => {
		const orphan: GltfJson = { nodes: [{ mesh: 0 }] };
		const { moved } = restoreMeshNames(buildGlb(orphan));
		expect(moved).toBe(0);
	});
});

describe('meshNodeNames', () => {
	it('reports only nodes that actually carry a mesh', () => {
		expect(meshNodeNames(buildGlb(packed))).toEqual(new Set());
	});

	it('surfaces the names a packed build would have dropped', () => {
		const source = buildGlb({
			nodes: [
				{ name: 'SKIN_TORS', mesh: 0 },
				{ name: 'TORS', mesh: 1 },
			],
		});
		const before = meshNodeNames(source);
		const after = meshNodeNames(buildGlb(packed));
		const missing = [...before].filter((n) => !after.has(n));
		expect(missing).toEqual(['SKIN_TORS', 'TORS']);
	});
});
