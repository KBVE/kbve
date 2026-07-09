import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COVE_R, TILE, WALL_H, WALL_SEG } from '../config';
import { insetUV } from './uv';
import { exposedFaces, faceMatrix, isBay } from './faces';
import { hash01 } from './rng';

function flipU(g: THREE.BufferGeometry): void {
	const uv = g.attributes.uv as THREE.BufferAttribute;
	for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
	uv.needsUpdate = true;
}

export const WALL_TEX_COUNT = 3;

const CAP_H = WALL_H - COVE_R;
const V_SEGMENTS = Math.max(1, Math.round(CAP_H / TILE));
const SEG_H = CAP_H / V_SEGMENTS;

function texBucket(col: number, row: number): number {
	return (col * 3 + row * 5) % WALL_TEX_COUNT;
}

export function buildWalls(): THREE.BufferGeometry[] {
	const buckets: THREE.BufferGeometry[][] = Array.from(
		{ length: WALL_TEX_COUNT },
		() => [],
	);

	for (const face of exposedFaces()) {
		if (isBay(face)) continue;
		const nc = face.col + face.dir.dc;
		const nr = face.row + face.dir.dr;
		const flip = hash01(face.col, face.row, face.di) > 0.5;
		for (let seg = 0; seg < V_SEGMENTS; seg++) {
			const cy = seg * SEG_H + SEG_H / 2;
			const quad = new THREE.PlaneGeometry(
				TILE,
				SEG_H,
				WALL_SEG,
				WALL_SEG,
			);
			insetUV(quad);
			if (flip) flipU(quad);
			quad.applyMatrix4(faceMatrix(face, cy));
			buckets[texBucket(nc, nr)].push(quad);
		}
	}

	return buckets.map((geos) =>
		geos.length ? mergeGeometries(geos, false) : new THREE.BufferGeometry(),
	);
}
