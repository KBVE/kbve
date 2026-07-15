globalThis.self = globalThis;
import * as THREE from 'three';
import fs from 'fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const ROOT = '/Users/alappatel/Documents/GitHub/kbve/apps/herbmail/herbmail-game';
const TARGET = process.env.TARGET || ROOT + '/public/models/character-anim.glb';
const SOURCE = process.env.SOURCE || ROOT + '/public/models/m2m-character.glb';
const OUT = process.argv[2];
const CLIPS = process.argv.slice(3);
const FPS = 30;

function load(p) {
	const b = fs.readFileSync(p);
	return new Promise((r, j) =>
		new GLTFLoader().parse(
			b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
			'',
			r,
			j,
		),
	);
}
function bonesOf(g) {
	const m = {};
	g.scene.traverse((o) => {
		if (o.isBone) m[o.name === 'Head' ? 'head' : o.name] = o;
	});
	return m;
}

const knight = await load(TARGET);
const m2m = await load(SOURCE);
const kb = bonesOf(knight);
const mb = bonesOf(m2m);
const shared = Object.keys(kb).filter((n) => mb[n]);
knight.scene.updateMatrixWorld(true);
m2m.scene.updateMatrixWorld(true);
const kRest = {};
const mRest = {};
const kRestPos = {};
const mRestPos = {};
for (const n of shared) {
	kRest[n] = kb[n].getWorldQuaternion(new THREE.Quaternion());
	mRest[n] = mb[n].getWorldQuaternion(new THREE.Quaternion());
	kRestPos[n] = kb[n].position.clone();
	mRestPos[n] = mb[n].position.clone();
}
const order = [];
(function walk(o) {
	if (o.isBone && shared.includes(o.name)) order.push(o.name);
	o.children.forEach(walk);
})(knight.scene);

const mx = new THREE.AnimationMixer(m2m.scene);
const _wm = new THREE.Quaternion();
const _wk = new THREE.Quaternion();
const _pw = new THREE.Quaternion();
const _mri = new THREE.Quaternion();
function retargetFrame(clip, t) {
	mx.stopAllAction();
	const a = mx.clipAction(clip);
	a.reset().play();
	mx.setTime(t);
	m2m.scene.updateMatrixWorld(true);
	for (const n of order) {
		mb[n].getWorldQuaternion(_wm);
		_mri.copy(mRest[n]).invert();
		_wk.copy(_wm).multiply(_mri).multiply(kRest[n]);
		kb[n].parent.getWorldQuaternion(_pw).invert();
		kb[n].quaternion.copy(_pw.multiply(_wk));
		kb[n].updateWorldMatrix(false, false);
	}
}

// --- parse target glb container ---
const data = fs.readFileSync(TARGET);
const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
let off = 12;
let json;
let binChunk;
while (off < data.byteLength) {
	const len = dv.getUint32(off, true);
	const type = dv.getUint32(off + 4, true);
	off += 8;
	if (type === 0x4e4f534a)
		json = JSON.parse(new TextDecoder().decode(data.subarray(off, off + len)));
	else if (type === 0x004e4942) binChunk = data.subarray(off, off + len);
	off += len;
}
const nodeIndex = {};
json.nodes.forEach((nd, i) => {
	if (nd.name) nodeIndex[nd.name] = i;
});

const chunks = [binChunk];
let binLen = binChunk.byteLength;
function pushAccessor(f32, count, type) {
	const bytes = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
	const pad = (4 - (binLen % 4)) % 4;
	if (pad) {
		chunks.push(new Uint8Array(pad));
		binLen += pad;
	}
	const bvIndex = json.bufferViews.length;
	json.bufferViews.push({
		buffer: 0,
		byteOffset: binLen,
		byteLength: bytes.byteLength,
	});
	chunks.push(bytes);
	binLen += bytes.byteLength;
	const acc = { bufferView: bvIndex, componentType: 5126, count, type };
	if (type === 'SCALAR') {
		let mn = Infinity;
		let mx2 = -Infinity;
		for (let i = 0; i < f32.length; i++) {
			if (f32[i] < mn) mn = f32[i];
			if (f32[i] > mx2) mx2 = f32[i];
		}
		acc.min = [mn];
		acc.max = [mx2];
	}
	const accIndex = json.accessors.length;
	json.accessors.push(acc);
	return accIndex;
}

for (const clipName of CLIPS) {
	const src = m2m.animations.find((c) => c.name === clipName);
	if (!src) {
		console.log('MISSING source', clipName);
		continue;
	}
	const nFrames = Math.max(2, Math.round(src.duration * FPS) + 1);
	const times = new Float32Array(nFrames);
	const rot = {};
	for (const n of order) rot[n] = new Float32Array(nFrames * 4);
	const pelvisPos = new Float32Array(nFrames * 3);
	for (let fi = 0; fi < nFrames; fi++) {
		const t = (fi / (nFrames - 1)) * src.duration;
		times[fi] = t;
		retargetFrame(src, t);
		for (const n of order) {
			const q = kb[n].quaternion;
			let x = q.x;
			let y = q.y;
			let z = q.z;
			let w = q.w;
			if (fi > 0) {
				const p = (fi - 1) * 4;
				const b = rot[n];
				if (x * b[p] + y * b[p + 1] + z * b[p + 2] + w * b[p + 3] < 0) {
					x = -x;
					y = -y;
					z = -z;
					w = -w;
				}
			}
			const o2 = fi * 4;
			rot[n][o2] = x;
			rot[n][o2 + 1] = y;
			rot[n][o2 + 2] = z;
			rot[n][o2 + 3] = w;
		}
		const md = mb['pelvis'].position;
		pelvisPos[fi * 3] = kRestPos['pelvis'].x + (md.x - mRestPos['pelvis'].x);
		pelvisPos[fi * 3 + 1] =
			kRestPos['pelvis'].y + (md.y - mRestPos['pelvis'].y);
		pelvisPos[fi * 3 + 2] =
			kRestPos['pelvis'].z + (md.z - mRestPos['pelvis'].z);
	}
	const inputAcc = pushAccessor(times, nFrames, 'SCALAR');
	const samplers = [];
	const channels = [];
	for (const n of order) {
		const outAcc = pushAccessor(rot[n], nFrames, 'VEC4');
		const si = samplers.length;
		samplers.push({
			input: inputAcc,
			output: outAcc,
			interpolation: 'LINEAR',
		});
		channels.push({
			sampler: si,
			target: { node: nodeIndex[n], path: 'rotation' },
		});
	}
	const pAcc = pushAccessor(pelvisPos, nFrames, 'VEC3');
	const psi = samplers.length;
	samplers.push({ input: inputAcc, output: pAcc, interpolation: 'LINEAR' });
	channels.push({
		sampler: psi,
		target: { node: nodeIndex['pelvis'], path: 'translation' },
	});
	json.animations.push({ name: clipName, samplers, channels });
	console.log('retargeted', clipName, nFrames, 'frames', order.length, 'bones');
}

// --- assemble new bin + glb ---
const finalPad = (4 - (binLen % 4)) % 4;
if (finalPad) {
	chunks.push(new Uint8Array(finalPad));
	binLen += finalPad;
}
const newBin = new Uint8Array(binLen);
{
	let p = 0;
	for (const c of chunks) {
		newBin.set(c, p);
		p += c.byteLength;
	}
}
json.buffers[0].byteLength = binLen;
delete json.buffers[0].uri;

const jsonStr = JSON.stringify(json);
const jsonBytes = new TextEncoder().encode(jsonStr);
const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4;
const jsonLen = jsonBytes.byteLength + jsonPad;
const total = 12 + 8 + jsonLen + 8 + binLen;
const out = new Uint8Array(total);
const odv = new DataView(out.buffer);
odv.setUint32(0, 0x46546c67, true);
odv.setUint32(4, 2, true);
odv.setUint32(8, total, true);
odv.setUint32(12, jsonLen, true);
odv.setUint32(16, 0x4e4f534a, true);
out.set(jsonBytes, 20);
for (let i = 0; i < jsonPad; i++) out[20 + jsonBytes.byteLength + i] = 0x20;
let p = 20 + jsonLen;
odv.setUint32(p, binLen, true);
odv.setUint32(p + 4, 0x004e4942, true);
out.set(newBin, p + 8);
fs.writeFileSync(OUT, out);
console.log('wrote', OUT, total, 'bytes');
