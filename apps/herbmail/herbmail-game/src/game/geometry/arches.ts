import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TILE, WALL_H } from '../config';
import { archTiles } from './faces';
import type { Grid } from './grid';
import { jitter } from './rng';
import { scaleUV } from './uv';

const HALF = TILE / 2;

function archShape(openHW: number, spring: number): THREE.Shape {
	const sink = TILE * 0.3;
	const s = new THREE.Shape();
	s.moveTo(-HALF, -sink);
	s.lineTo(HALF, -sink);
	s.lineTo(HALF, WALL_H);
	s.lineTo(-HALF, WALL_H);
	s.closePath();
	const hole = new THREE.Path();
	hole.moveTo(-openHW, -sink);
	hole.lineTo(openHW, -sink);
	hole.lineTo(openHW, spring);
	hole.absarc(0, spring, openHW, 0, Math.PI, false);
	hole.lineTo(-openHW, -sink);
	s.holes.push(hole);
	return s;
}

export function buildArches(grid: Grid): THREE.BufferGeometry {
	const arches = archTiles(grid);
	if (!arches.length) return new THREE.BufferGeometry();

	const depth = TILE * 0.16;
	const parts: THREE.BufferGeometry[] = [];

	for (const a of arches) {
		const openHW = jitter(a.col, a.row, 1, TILE * 0.28, TILE * 0.38);
		const spring = jitter(a.col, a.row, 2, TILE * 0.95, TILE * 1.25);
		const shape = archShape(openHW, spring);
		const g = new THREE.ExtrudeGeometry(shape, {
			depth,
			bevelEnabled: false,
		});
		scaleUV(g, 1 / TILE);
		g.translate(0, 0, -depth / 2);
		const m = new THREE.Matrix4().makeTranslation(
			a.col * TILE + HALF,
			0,
			a.row * TILE + HALF,
		);
		if (a.axis === 'x')
			m.multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
		g.applyMatrix4(m);
		parts.push(g);
	}

	return mergeGeometries(parts, false);
}
