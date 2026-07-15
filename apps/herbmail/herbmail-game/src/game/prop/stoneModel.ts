import * as THREE from 'three';
import { hash01 } from '../geometry/rng';

const SEED_SPREAD = 8192;

function smooth(t: number): number {
	return t * t * (3 - 2 * t);
}

function valueNoise(seed: number, x: number, y: number, z: number): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const iz = Math.floor(z);
	const fx = smooth(x - ix);
	const fy = smooth(y - iy);
	const fz = smooth(z - iz);
	const s = (seed | 0) * SEED_SPREAD;

	const c000 = hash01(s + ix, iy, iz);
	const c100 = hash01(s + ix + 1, iy, iz);
	const c010 = hash01(s + ix, iy + 1, iz);
	const c110 = hash01(s + ix + 1, iy + 1, iz);
	const c001 = hash01(s + ix, iy, iz + 1);
	const c101 = hash01(s + ix + 1, iy, iz + 1);
	const c011 = hash01(s + ix, iy + 1, iz + 1);
	const c111 = hash01(s + ix + 1, iy + 1, iz + 1);

	const x00 = c000 + (c100 - c000) * fx;
	const x10 = c010 + (c110 - c010) * fx;
	const x01 = c001 + (c101 - c001) * fx;
	const x11 = c011 + (c111 - c011) * fx;
	const y0 = x00 + (x10 - x00) * fy;
	const y1 = x01 + (x11 - x01) * fy;
	return y0 + (y1 - y0) * fz;
}

function fbm(
	seed: number,
	x: number,
	y: number,
	z: number,
	octaves = 3,
): number {
	let sum = 0;
	let amp = 0.5;
	let freq = 1;
	let norm = 0;
	for (let o = 0; o < octaves; o++) {
		sum += amp * valueNoise(seed + o * 17, x * freq, y * freq, z * freq);
		norm += amp;
		amp *= 0.5;
		freq *= 2.1;
	}
	return sum / norm;
}

function ridged(
	seed: number,
	x: number,
	y: number,
	z: number,
	octaves = 4,
): number {
	let sum = 0;
	let amp = 0.5;
	let freq = 1;
	let norm = 0;
	for (let o = 0; o < octaves; o++) {
		const n = valueNoise(seed + o * 31, x * freq, y * freq, z * freq);
		const r = 1 - Math.abs(2 * n - 1);
		sum += amp * r * r;
		norm += amp;
		amp *= 0.55;
		freq *= 2.17;
	}
	return sum / norm;
}

function rockDisplacement(
	seed: number,
	dx: number,
	dy: number,
	dz: number,
	noiseFreq: number,
	crag: number,
): number {
	const wx = fbm(seed + 331, dx * 1.7, dy * 1.7, dz * 1.7);
	const wy = fbm(seed + 733, dx * 1.7 + 4.3, dy * 1.7 + 1.9, dz * 1.7 + 7.1);
	const wz = fbm(seed + 971, dx * 1.7 + 8.1, dy * 1.7 + 9.2, dz * 1.7 + 3.4);
	const warp = 0.7;
	const bx = dx * noiseFreq + (wx - 0.5) * warp;
	const by = dy * noiseFreq + (wy - 0.5) * warp;
	const bz = dz * noiseFreq + (wz - 0.5) * warp;
	const body = fbm(seed, bx, by, bz, 5) - 0.5;
	const crest = ridged(seed + 1900, bx * 1.8, by * 1.8, bz * 1.8) - 0.4;
	const grain = valueNoise(seed, dx * 7, dy * 7, dz * 7) - 0.5;
	const bands = fbm(seed + 2600, dx * 0.9, dy * 0.9, dz * 0.9) * 2.4;
	const strata = Math.sin(dy * 5.5 + bands) * 0.5 - 0.25;
	const pit = valueNoise(seed + 3300, dx * 5.5, dy * 5.5, dz * 5.5);
	const erode = smooth(Math.max(0, (pit - 0.62) / 0.38)) * -0.5;
	return (
		body * (1 - crag) +
		crest * crag +
		grain * 0.12 +
		strata * 0.14 +
		erode * 0.5
	);
}

export interface StoneShape {
	detail: number;
	faceted: boolean;
	amp: number;
	stretch: [number, number, number];
	tilt: number;
	crag: number;
}

export function stoneShape(seed: number, lumpiness: number): StoneShape {
	const boulder = hash01(seed, 7, 13) < 0.45;
	const sx = 0.8 + hash01(seed, 21, 3) * 0.7;
	const sz = 0.8 + hash01(seed, 4, 29) * 0.7;
	const sy = boulder
		? 0.7 + hash01(seed, 9, 17) * 0.5
		: 0.9 + hash01(seed, 9, 17) * 0.6;
	return {
		detail: boulder ? 2 : 3,
		faceted: boulder,
		amp: lumpiness * (boulder ? 1.5 : 1),
		stretch: [sx, sy, sz],
		tilt: (hash01(seed, 55, 8) - 0.5) * (boulder ? 0.5 : 0.2),
		crag: (boulder ? 0.55 : 0.32) + hash01(seed, 88, 6) * 0.2,
	};
}

export function stoneGeometry(
	seed: number,
	size: number,
	lumpiness: number,
): THREE.BufferGeometry {
	const shape = stoneShape(seed, lumpiness);
	let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(
		size,
		shape.detail,
	);
	if (shape.faceted && geo.index) geo = geo.toNonIndexed();
	const pos = geo.attributes.position as THREE.BufferAttribute;
	const amp = shape.amp * size;
	const noiseFreq = 2.4 / Math.max(size, 1e-4);
	const [sx, sy, sz] = shape.stretch;
	const cosT = Math.cos(shape.tilt);
	const sinT = Math.sin(shape.tilt);

	const dir = new THREE.Vector3();
	let minY = Infinity;
	let maxY = -Infinity;
	const nVals = new Float32Array(pos.count);
	let nMin = Infinity;
	let nMax = -Infinity;

	for (let i = 0; i < pos.count; i++) {
		dir.set(pos.getX(i), pos.getY(i), pos.getZ(i));
		const len = dir.length() || 1;
		dir.divideScalar(len);
		const n = rockDisplacement(
			seed,
			dir.x,
			dir.y,
			dir.z,
			noiseFreq,
			shape.crag,
		);
		nVals[i] = n;
		if (n < nMin) nMin = n;
		if (n > nMax) nMax = n;
		const r = size + n * amp * 2;
		let vx = dir.x * r * sx;
		let vy = dir.y * r * sy;
		const vz = dir.z * r * sz;
		const rx = vx * cosT - vy * sinT;
		vy = vx * sinT + vy * cosT;
		vx = rx;
		if (vy < -size * 0.35) vy = -size * 0.35;
		pos.setXYZ(i, vx, vy, vz);
		if (vy < minY) minY = vy;
		if (vy > maxY) maxY = vy;
	}

	if (Number.isFinite(minY)) {
		for (let i = 0; i < pos.count; i++) {
			pos.setY(i, pos.getY(i) - minY);
		}
	}
	pos.needsUpdate = true;

	const nRange = nMax - nMin || 1;
	const height = maxY - minY || 1;
	const col = new Float32Array(pos.count * 3);
	for (let i = 0; i < pos.count; i++) {
		const ao = smooth((nVals[i] - nMin) / nRange);
		const heightFrac = (pos.getY(i) - 0) / height;
		const shade = (0.5 + 0.5 * ao) * (0.72 + 0.28 * heightFrac);
		col[i * 3] = shade;
		col[i * 3 + 1] = shade * 0.98;
		col[i * 3 + 2] = shade * 0.95;
	}
	geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

	geo.computeVertexNormals();

	const uvScale = 0.5 / Math.max(size, 1e-4);
	const nrm = geo.attributes.normal as THREE.BufferAttribute;
	const uv = new Float32Array(pos.count * 2);
	for (let i = 0; i < pos.count; i++) {
		const px = pos.getX(i);
		const py = pos.getY(i);
		const pz = pos.getZ(i);
		const ax = Math.abs(nrm.getX(i));
		const ay = Math.abs(nrm.getY(i));
		const az = Math.abs(nrm.getZ(i));
		let u: number;
		let v: number;
		if (ax >= ay && ax >= az) {
			u = pz;
			v = py;
		} else if (az >= ax && az >= ay) {
			u = px;
			v = py;
		} else {
			u = px;
			v = pz;
		}
		uv[i * 2] = u * uvScale;
		uv[i * 2 + 1] = v * uvScale;
	}
	geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

	geo.computeBoundingBox();
	geo.computeBoundingSphere();
	return geo;
}
