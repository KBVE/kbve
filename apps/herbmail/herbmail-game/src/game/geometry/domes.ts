import * as THREE from 'three';
import { TILE, WALL_H } from '../config';
import type { Grid } from './grid';
import type { OasisSlot } from '../dungeon/generate';

const PHI_SEG = 32;
const THETA_SEG = 10;
export const DOME_RISE = 0.85; // dome height as a fraction of the smaller room radius
export const DOME_OCULUS = 0.24; // oculus radius as a fraction of the ring radius

// One inward-facing ellipsoidal dome per oasis room, springing from the wall
// tops (WALL_H) up to a circular oculus at the apex — a designed light-well that
// vaults the room and funnels the open sky onto the pool. Interior normals so
// the PSX material lights the underside; UVs in tile units for texel parity with
// the walls.
export function buildOasisDomes(
	grid: Grid,
	oases: readonly OasisSlot[],
): THREE.BufferGeometry {
	const pos: number[] = [];
	const nor: number[] = [];
	const uv: number[] = [];
	const idx: number[] = [];

	const thetaMin = Math.asin(DOME_OCULUS);
	const thetaMax = Math.PI / 2;

	for (const o of oases) {
		const cx = (grid.originCol + o.rc + o.rw / 2) * TILE;
		const cz = (grid.originRow + o.rr + o.rh / 2) * TILE;
		const rx = (o.rw * TILE) / 2;
		const rz = (o.rh * TILE) / 2;
		const height = Math.min(rx, rz) * DOME_RISE;
		const base = pos.length / 3;

		for (let ti = 0; ti <= THETA_SEG; ti++) {
			const theta =
				thetaMin + ((thetaMax - thetaMin) * ti) / THETA_SEG;
			const st = Math.sin(theta);
			const ct = Math.cos(theta);
			const v = (ti / THETA_SEG) * (Math.min(rx, rz) / TILE);
			for (let pi = 0; pi <= PHI_SEG; pi++) {
				const phi = (Math.PI * 2 * pi) / PHI_SEG;
				const cp = Math.cos(phi);
				const sp = Math.sin(phi);
				const x = cx + rx * st * cp;
				const y = WALL_H + height * ct;
				const z = cz + rz * st * sp;
				pos.push(x, y, z);
				// Inward (interior) normal: negated ellipsoid gradient.
				const nx = -(st * cp) / rx;
				const ny = -ct / height;
				const nz = -(st * sp) / rz;
				const nl = Math.hypot(nx, ny, nz) || 1;
				nor.push(nx / nl, ny / nl, nz / nl);
				uv.push((pi / PHI_SEG) * ((o.rw + o.rh) / 2), v);
			}
		}

		const stride = PHI_SEG + 1;
		for (let ti = 0; ti < THETA_SEG; ti++) {
			for (let pi = 0; pi < PHI_SEG; pi++) {
				const a = base + ti * stride + pi;
				const b = a + 1;
				const c = a + stride;
				const d = c + 1;
				// Winding for the inward face (seen from below inside the room).
				idx.push(a, c, b, b, c, d);
			}
		}
	}

	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
	g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
	g.setIndex(idx);
	return g;
}
