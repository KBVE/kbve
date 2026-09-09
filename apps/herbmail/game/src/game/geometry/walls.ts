import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COVE_R, TILE, WALL_H } from '../config';
import { exposedFaces, faceMatrix, isBay, worldCol, worldRow } from './faces';
import { ARCH, gridTile, type Grid } from './grid';
import { hash01 } from './rng';

function flipU(g: THREE.BufferGeometry): void {
	const uv = g.attributes.uv as THREE.BufferAttribute;
	for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
	uv.needsUpdate = true;
}

export const WALL_TEX_COUNT = 3;

const CAP_H = WALL_H - COVE_R;
const V_REPEAT = CAP_H / TILE;
// Bricks per face. 1 tiled the whole texture across a 3m tile (oversized
// blocks); higher packs smaller, denser courses that read as masonry.
const TEX_DENSITY = 2;

function tileUV(g: THREE.BufferGeometry): void {
	const uv = g.attributes.uv as THREE.BufferAttribute;
	for (let i = 0; i < uv.count; i++) {
		uv.setX(i, uv.getX(i) * TEX_DENSITY);
		uv.setY(i, uv.getY(i) * V_REPEAT * TEX_DENSITY);
	}
	uv.needsUpdate = true;
}

function texBucket(col: number, row: number, variant: number): number {
	return (
		(((col * 3 + row * 5 + variant * 7) % WALL_TEX_COUNT) +
			WALL_TEX_COUNT) %
		WALL_TEX_COUNT
	);
}

export function buildWalls(grid: Grid, variant = 0): THREE.BufferGeometry[] {
	const buckets: THREE.BufferGeometry[][] = Array.from(
		{ length: WALL_TEX_COUNT },
		() => [],
	);

	for (const face of exposedFaces(grid)) {
		// Arch tiles are doorways. Only the passage-facing side (the neighbor is
		// out-of-bounds = the opening into the hall) must stay clear; the side
		// faces are the hall walls flanking the passage and are kept.
		if (gridTile(grid, face.col, face.row) === ARCH) {
			const nc = face.col + face.dir.dc;
			const nr = face.row + face.dir.dr;
			const oob = nc < 0 || nc >= grid.cols || nr < 0 || nr >= grid.rows;
			if (oob) continue;
		}
		if (isBay(grid, face, variant)) continue;
		const wc = worldCol(grid, face);
		const wr = worldRow(grid, face);
		const nc = wc + face.dir.dc;
		const nr = wr + face.dir.dr;
		const flip = hash01(wc, wr, face.di + variant * 17) > 0.5;
		// One quad per face; vertical texture tiling comes from UV repeat
		// (walls no longer stack a quad per TILE of height).
		const quad = new THREE.PlaneGeometry(TILE, CAP_H, 1, 1);
		if (flip) flipU(quad);
		tileUV(quad);
		quad.applyMatrix4(faceMatrix(grid, face, CAP_H / 2));
		buckets[texBucket(nc, nr, variant)].push(quad);
	}

	return buckets.map((geos) =>
		geos.length ? mergeGeometries(geos, false) : new THREE.BufferGeometry(),
	);
}
