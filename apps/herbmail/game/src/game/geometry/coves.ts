import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COVE_R, TILE, WALL_H } from '../config';
import { exposedFaces, faceMatrix } from './faces';
import { ARCH, gridTile, type Grid } from './grid';

const ARC_SEG = 4;
const LAT_SEG = 1;
const HALF = TILE / 2;
const Z_OFF = 0.03;

function coveProfile(): THREE.BufferGeometry {
	const R = COVE_R;
	const cy = WALL_H - R;
	const pos: number[] = [];
	const uv: number[] = [];
	const idx: number[] = [];

	for (let a = 0; a <= ARC_SEG; a++) {
		const t = a / ARC_SEG;
		const angle = Math.PI - t * (Math.PI / 2);
		const z = R + R * Math.cos(angle) + Z_OFF;
		const y = cy + R * Math.sin(angle);
		for (let w = 0; w <= LAT_SEG; w++) {
			const x = -HALF + (w / LAT_SEG) * TILE;
			pos.push(x, y, z);
			uv.push(w / LAT_SEG, t);
		}
	}

	const stride = LAT_SEG + 1;
	for (let a = 0; a < ARC_SEG; a++) {
		for (let w = 0; w < LAT_SEG; w++) {
			const i0 = a * stride + w;
			const i1 = i0 + 1;
			const i2 = i0 + stride;
			const i3 = i2 + 1;
			idx.push(i0, i2, i1, i1, i2, i3);
		}
	}

	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
	g.setIndex(idx);
	g.computeVertexNormals();
	return g;
}

export function buildCoves(grid: Grid): THREE.BufferGeometry {
	const faces = exposedFaces(grid);
	if (!faces.length) return new THREE.BufferGeometry();

	const profile = coveProfile();
	const parts: THREE.BufferGeometry[] = [];
	for (const face of faces) {
		// Skip the doorway opening (passage side faces out-of-bounds) so no cove
		// arc is draped across the top of the passage.
		if (gridTile(grid, face.col, face.row) === ARCH) {
			const nc = face.col + face.dir.dc;
			const nr = face.row + face.dir.dr;
			if (nc < 0 || nc >= grid.cols || nr < 0 || nr >= grid.rows)
				continue;
		}
		const g = profile.clone();
		g.applyMatrix4(faceMatrix(grid, face, 0));
		parts.push(g);
	}
	return mergeGeometries(parts, false);
}
