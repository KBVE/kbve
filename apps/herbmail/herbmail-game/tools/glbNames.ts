import fs from 'node:fs';

export interface GltfNode {
	name?: string;
	mesh?: number;
	children?: number[];
}

export interface GltfAnimation {
	name?: string;
	channels?: unknown[];
}

export interface GltfJson {
	nodes?: GltfNode[];
	animations?: GltfAnimation[];
}

const HEADER = 12;
const CHUNK_HEADER = 8;
const JSON_START = HEADER + CHUNK_HEADER;

export function readGltfJson(glb: Buffer): GltfJson {
	const jsonLen = glb.readUInt32LE(HEADER);
	return JSON.parse(
		glb.subarray(JSON_START, JSON_START + jsonLen).toString('utf8'),
	);
}

export function meshNodeNames(glb: Buffer): Set<string> {
	const out = new Set<string>();
	for (const n of readGltfJson(glb).nodes ?? [])
		if (n.mesh !== undefined && n.name) out.add(n.name);
	return out;
}

export function restoreMeshNames(glb: Buffer): {
	glb: Buffer;
	moved: number;
} {
	const jsonLen = glb.readUInt32LE(HEADER);
	const jsonEnd = JSON_START + jsonLen;
	const gltf = readGltfJson(glb);
	const nodes = gltf.nodes ?? [];
	const parentOf = new Map<number, number>();
	nodes.forEach((n, i) => {
		for (const c of n.children ?? []) parentOf.set(c, i);
	});

	let moved = 0;
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		if (node.mesh === undefined || node.name) continue;
		const p = parentOf.get(i);
		if (p === undefined) continue;
		const parent = nodes[p];
		if (!parent.name || parent.mesh !== undefined) continue;
		if ((parent.children ?? []).length !== 1) continue;
		node.name = parent.name;
		delete parent.name;
		moved++;
	}
	if (moved === 0) return { glb, moved: 0 };

	let json = Buffer.from(JSON.stringify(gltf), 'utf8');
	const pad = (4 - (json.length % 4)) % 4;
	if (pad) json = Buffer.concat([json, Buffer.alloc(pad, 0x20)]);
	const rest = glb.subarray(jsonEnd);
	const header = Buffer.alloc(JSON_START);
	glb.copy(header, 0, 0, JSON_START);
	header.writeUInt32LE(HEADER + CHUNK_HEADER + json.length + rest.length, 8);
	header.writeUInt32LE(json.length, HEADER);
	return { glb: Buffer.concat([header, json, rest]), moved };
}

export function restoreMeshNamesInFile(file: string): number {
	const { glb, moved } = restoreMeshNames(fs.readFileSync(file));
	if (moved > 0) fs.writeFileSync(file, glb);
	return moved;
}

export function meshNodeNamesInFile(file: string): Set<string> {
	return meshNodeNames(fs.readFileSync(file));
}

// Channels per clip. gltfpack drops animation tracks whose value never changes
// unless -ac is passed, which silently breaks pose resets: a bone the outgoing
// clip moved and the incoming clip only holds constant has nothing left to
// drive it back, so it keeps the old pose and the stance snaps.
export function animationChannelCounts(glb: Buffer): Map<string, number> {
	const out = new Map<string, number>();
	(readGltfJson(glb).animations ?? []).forEach((a, i) =>
		out.set(a.name ?? `#${i}`, (a.channels ?? []).length),
	);
	return out;
}

export function animationChannelCountsInFile(
	file: string,
): Map<string, number> {
	return animationChannelCounts(fs.readFileSync(file));
}
