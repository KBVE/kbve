import * as THREE from 'three';
import { TILE, WALL_H } from '../config';
import type { Grid } from './grid';

const SLAB_SEGS_PER_TILE = 1;

function buildSlab(grid: Grid, y: number, flip: boolean): THREE.BufferGeometry {
	const w = grid.cols * TILE;
	const d = grid.rows * TILE;
	const x0 = grid.originCol * TILE;
	const z0 = grid.originRow * TILE;
	const g = new THREE.PlaneGeometry(
		w,
		d,
		grid.cols * SLAB_SEGS_PER_TILE,
		grid.rows * SLAB_SEGS_PER_TILE,
	);
	g.rotateX(flip ? Math.PI / 2 : -Math.PI / 2);
	g.translate(x0 + w / 2, y, z0 + d / 2);
	const uv = g.attributes.uv as THREE.BufferAttribute;
	for (let i = 0; i < uv.count; i++) {
		uv.setXY(
			i,
			grid.originCol + uv.getX(i) * grid.cols,
			grid.originRow + uv.getY(i) * grid.rows,
		);
	}
	uv.needsUpdate = true;
	return g;
}

export function buildFloor(grid: Grid): THREE.BufferGeometry {
	return buildSlab(grid, 0, false);
}

export function buildCeiling(grid: Grid): THREE.BufferGeometry {
	return buildSlab(grid, WALL_H, true);
}
