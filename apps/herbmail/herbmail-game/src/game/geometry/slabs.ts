import * as THREE from 'three';
import { TILE, WALL_H } from '../config';
import { PIT, type Grid } from './grid';

function buildSlab(grid: Grid, y: number, flip: boolean): THREE.BufferGeometry {
	const w = grid.cols * TILE;
	const d = grid.rows * TILE;
	const x0 = grid.originCol * TILE;
	const z0 = grid.originRow * TILE;
	const g = new THREE.PlaneGeometry(w, d, 1, 1);
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

// Per-tile floor that skips PIT tiles — used only by grids that carry a pool,
// so the plain single-quad slab stays the shared fast path.
export function buildFloorWithHoles(grid: Grid): THREE.BufferGeometry {
	const pos: number[] = [];
	const uv: number[] = [];
	const idx: number[] = [];
	for (let row = 0; row < grid.rows; row++) {
		for (let col = 0; col < grid.cols; col++) {
			if (grid.tileAt(col, row) & PIT) continue;
			const x0 = (grid.originCol + col) * TILE;
			const z0 = (grid.originRow + row) * TILE;
			const b = pos.length / 3;
			pos.push(
				x0,
				0,
				z0,
				x0 + TILE,
				0,
				z0,
				x0,
				0,
				z0 + TILE,
				x0 + TILE,
				0,
				z0 + TILE,
			);
			const uc = grid.originCol + col;
			const ur = grid.originRow + row;
			uv.push(uc, ur, uc + 1, ur, uc, ur + 1, uc + 1, ur + 1);
			idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
	const normals = new Float32Array(pos.length);
	for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
	g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
	g.setIndex(idx);
	return g;
}

export function buildCeiling(grid: Grid): THREE.BufferGeometry {
	return buildSlab(grid, WALL_H, true);
}
