import * as THREE from 'three';
import { hash01 } from '../geometry/rng';

// Procedural natural rock for the PSX dungeon. Pure geometry: an icosphere pushed
// outward by seeded 3D value-noise so every stone is a unique lump, then the bottom
// is flattened and dropped so min-y == 0 (origin sits at the floor contact point).
// Deterministic in (seed, size, lumpiness) for room streaming.

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

function fbm(seed: number, x: number, y: number, z: number): number {
	let sum = 0;
	let amp = 0.5;
	let freq = 1;
	let norm = 0;
	for (let o = 0; o < 3; o++) {
		sum += amp * valueNoise(seed + o * 17, x * freq, y * freq, z * freq);
		norm += amp;
		amp *= 0.5;
		freq *= 2.1;
	}
	return sum / norm;
}

export interface StoneShape {
	detail: number;
	faceted: boolean;
	amp: number;
	stretch: [number, number, number];
	tilt: number;
}

export function stoneShape(seed: number, lumpiness: number): StoneShape {
	const boulder = hash01(seed, 7, 13) < 0.45;
	const sx = 0.8 + hash01(seed, 21, 3) * 0.7;
	const sz = 0.8 + hash01(seed, 4, 29) * 0.7;
	const sy = boulder
		? 0.7 + hash01(seed, 9, 17) * 0.5
		: 0.9 + hash01(seed, 9, 17) * 0.6;
	return {
		detail: boulder ? 1 : 2,
		faceted: boulder,
		amp: lumpiness * (boulder ? 1.5 : 1),
		stretch: [sx, sy, sz],
		tilt: (hash01(seed, 55, 8) - 0.5) * (boulder ? 0.5 : 0.2),
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
	if (shape.faceted) geo = geo.toNonIndexed();
	const pos = geo.attributes.position as THREE.BufferAttribute;
	const amp = shape.amp * size;
	const noiseFreq = 2.4 / Math.max(size, 1e-4);
	const [sx, sy, sz] = shape.stretch;
	const cosT = Math.cos(shape.tilt);
	const sinT = Math.sin(shape.tilt);

	const dir = new THREE.Vector3();
	let minY = Infinity;

	for (let i = 0; i < pos.count; i++) {
		dir.set(pos.getX(i), pos.getY(i), pos.getZ(i));
		const len = dir.length() || 1;
		dir.divideScalar(len);
		const n =
			valueNoise(seed, dir.x * 4, dir.y * 4, dir.z * 4) * 0.6 +
			fbm(
				seed + 101,
				dir.x * noiseFreq,
				dir.y * noiseFreq,
				dir.z * noiseFreq,
			) *
				0.4;
		const r = size + n * amp;
		let vx = dir.x * r * sx;
		let vy = dir.y * r * sy;
		const vz = dir.z * r * sz;
		const rx = vx * cosT - vy * sinT;
		vy = vx * sinT + vy * cosT;
		vx = rx;
		if (vy < -size * 0.35) vy = -size * 0.35;
		pos.setXYZ(i, vx, vy, vz);
		if (vy < minY) minY = vy;
	}

	if (Number.isFinite(minY)) {
		for (let i = 0; i < pos.count; i++) {
			pos.setY(i, pos.getY(i) - minY);
		}
	}
	pos.needsUpdate = true;

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
