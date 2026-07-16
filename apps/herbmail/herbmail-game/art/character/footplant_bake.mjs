import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GLB = path.resolve(HERE, '..', '..', 'public', 'models', 'character-anim.glb');
const OUT = process.argv[2] || GLB;
const SOLES = process.argv[3] || path.join(HERE, 'soles.json');

const GROUND = new Set([
	'Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop',
	'Sword_Idle', 'Sword_Attack', 'Sword_Block', 'Punch_Cross',
]);
const REF_CLIP = 'Idle_Loop';

function parseGlb(buf) {
	const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	let off = 12, json, jsonBytes, binBytes;
	while (off < buf.byteLength) {
		const len = dv.getUint32(off, true);
		const type = dv.getUint32(off + 4, true);
		off += 8;
		const chunk = buf.subarray(off, off + len);
		if (type === 0x4e4f534a) { json = JSON.parse(new TextDecoder().decode(chunk)); jsonBytes = chunk; }
		else if (type === 0x004e4942) binBytes = chunk;
		off += len;
	}
	return { json, jsonBytes, binBytes };
}

const mins = JSON.parse(fs.readFileSync(SOLES, 'utf8'));
const ref = mins[REF_CLIP];
console.log('reference sole', REF_CLIP, ref.toFixed(4));

const data = fs.readFileSync(GLB);
const { json, jsonBytes, binBytes } = parseGlb(data);
const pelvisNode = json.nodes.findIndex((n) => n.name === 'pelvis');

const appended = [];
let appendLen = 0;
const align = (n) => (n + 3) & ~3;

for (const anim of json.animations) {
	if (!GROUND.has(anim.name) || mins[anim.name] == null) continue;
	const offset = mins[anim.name] - ref;
	if (Math.abs(offset) < 1e-4) { console.log(anim.name.padEnd(14), 'skip', offset.toFixed(4)); continue; }
	const sampler = anim.samplers[anim.channels.find(
		(c) => c.target.node === pelvisNode && c.target.path === 'translation')?.sampler];
	if (!sampler) { console.log(anim.name.padEnd(14), 'NO pelvis translation'); continue; }
	const acc = json.accessors[sampler.output];
	const bv = json.bufferViews[acc.bufferView];
	const start = (bv.byteOffset || 0) + (acc.byteOffset || 0);
	const src = new Float32Array(binBytes.buffer, binBytes.byteOffset + start, acc.count * 3);
	const copy = new Float32Array(src);
	for (let i = 0; i < acc.count; i++) copy[i * 3 + 1] -= offset;

	const byteOffset = binBytes.length + appendLen;
	const newBv = json.bufferViews.push({ buffer: 0, byteOffset, byteLength: copy.byteLength }) - 1;
	sampler.output = json.accessors.push({
		bufferView: newBv, componentType: 5126, count: acc.count, type: 'VEC3',
	}) - 1;
	appended.push(Buffer.from(copy.buffer, copy.byteOffset, copy.byteLength));
	appendLen += align(copy.byteLength);
	console.log(anim.name.padEnd(14), 'min', mins[anim.name].toFixed(4), 'offset', offset.toFixed(4));
}

const binParts = [Buffer.from(binBytes)];
let cursor = binBytes.length;
for (const part of appended) {
	binParts.push(part);
	cursor += part.length;
	const pad = align(cursor) - cursor;
	if (pad) { binParts.push(Buffer.alloc(pad)); cursor += pad; }
}
const newBin = Buffer.concat(binParts);
json.buffers[0].byteLength = newBin.length;

const newJson = Buffer.from(JSON.stringify(json), 'utf8');
const jsonPad = align(newJson.length) - newJson.length;
const jsonChunk = Buffer.concat([newJson, Buffer.alloc(jsonPad, 0x20)]);

const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
const total = 12 + 8 + jsonChunk.length + 8 + newBin.length;
header.writeUInt32LE(total, 8);
const jHdr = Buffer.alloc(8); jHdr.writeUInt32LE(jsonChunk.length, 0); jHdr.writeUInt32LE(0x4e4f534a, 4);
const bHdr = Buffer.alloc(8); bHdr.writeUInt32LE(newBin.length, 0); bHdr.writeUInt32LE(0x004e4942, 4);

fs.writeFileSync(OUT, Buffer.concat([header, jHdr, jsonChunk, bHdr, newBin]));
console.log('wrote', OUT, 'appended', appended.length, 'accessors,', newBin.length - binBytes.length, 'bytes');
