import * as THREE from 'three';
import { COLS, ROWS } from '../level';
import { TILE, WALL_H } from '../config';

function buildSlab(y: number, flip: boolean): THREE.BufferGeometry {
	const w = COLS * TILE;
	const d = ROWS * TILE;
	const g = new THREE.PlaneGeometry(w, d, COLS * 2, ROWS * 2);
	g.rotateX(flip ? Math.PI / 2 : -Math.PI / 2);
	g.translate(w / 2, y, d / 2);
	const uv = g.attributes.uv as THREE.BufferAttribute;
	for (let i = 0; i < uv.count; i++) {
		uv.setXY(i, uv.getX(i) * COLS, uv.getY(i) * ROWS);
	}
	uv.needsUpdate = true;
	return g;
}

export function buildFloor(): THREE.BufferGeometry {
	return buildSlab(0, false);
}

export function buildCeiling(): THREE.BufferGeometry {
	return buildSlab(WALL_H, true);
}
