globalThis.self = globalThis;
import * as THREE from 'three';
import fs from 'fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const ROOT = '/Users/alappatel/Documents/GitHub/kbve/apps/herbmail/herbmail-game';
const IN = ROOT + '/public/models/character-anim.glb';
const OUT = process.argv[2];
const CLIP = process.argv[3];
const SPEC = process.argv.slice(4);

const data = fs.readFileSync(IN);
const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
let off = 12;
let json;
let binOff = 0;
while (off < data.byteLength) {
	const len = dv.getUint32(off, true);
	const t = dv.getUint32(off + 4, true);
	off += 8;
	if (t === 0x4e4f534a)
		json = JSON.parse(new TextDecoder().decode(data.subarray(off, off + len)));
	else if (t === 0x004e4942) binOff = off;
	off += len;
}
const bin = data.subarray(binOff);
function accF32(i) {
	const a = json.accessors[i];
	const bv = json.bufferViews[a.bufferView];
	const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
	const n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type];
	return new Float32Array(bin.buffer, bin.byteOffset + start, a.count * n);
}
const nodeName = (i) => json.nodes[i].name;

const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
const gltf = await new Promise((r, j) => new GLTFLoader().parse(ab, '', r, j));
const sc = gltf.scene;
const mx = new THREE.AnimationMixer(sc);
const bn = {};
sc.traverse((o) => (bn[o.name] = o));

const bend = {};
for (const s of SPEC) {
	const [name, deg] = s.split(':');
	bend[name] = (parseFloat(deg) * Math.PI) / 180;
}

const anim = json.animations.find((a) => a.name === CLIP);
const clip = gltf.animations.find((a) => a.name === CLIP);
const outAcc = {};
for (const ch of anim.channels) {
	if (ch.target.path !== 'rotation') continue;
	const nm = nodeName(ch.target.node);
	if (bend[nm]) outAcc[nm] = anim.samplers[ch.sampler];
}
const _wq = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _dq = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);
const act = mx.clipAction(clip);
for (const nm in bend) {
	const sampler = outAcc[nm];
	if (!sampler) {
		console.log('no rotation track for', nm, '- skipping');
		continue;
	}
	const times = accF32(sampler.input);
	const out = accF32(sampler.output);
	for (let fi = 0; fi < times.length; fi++) {
		mx.stopAllAction();
		act.reset().play();
		mx.setTime(times[fi] + 1e-5);
		sc.updateMatrixWorld(true);
		const b = bn[nm];
		b.getWorldQuaternion(_wq);
		_dq.setFromAxisAngle(X, bend[nm]);
		_wq.premultiply(_dq);
		b.parent.getWorldQuaternion(_pq).invert();
		_pq.multiply(_wq);
		const o = fi * 4;
		let x = _pq.x;
		let y = _pq.y;
		let z = _pq.z;
		let w = _pq.w;
		if (fi > 0) {
			const p = o - 4;
			if (x * out[p] + y * out[p + 1] + z * out[p + 2] + w * out[p + 3] < 0) {
				x = -x;
				y = -y;
				z = -z;
				w = -w;
			}
		}
		out[o] = x;
		out[o + 1] = y;
		out[o + 2] = z;
		out[o + 3] = w;
	}
	console.log('bent', nm, ((bend[nm] * 180) / Math.PI).toFixed(1), 'deg', times.length, 'frames');
}
fs.writeFileSync(OUT, data);
console.log('wrote', OUT);
