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

export const ARCH_SALT = 53;

export function buildArches(grid: Grid, variant = 0): THREE.BufferGeometry {
	const arches = archTiles(grid);
	if (!arches.length) return new THREE.BufferGeometry();

	const depth = TILE * 0.16;
	const parts: THREE.BufferGeometry[] = [];

	for (const a of arches) {
		const salt = variant * ARCH_SALT;
		const openHW = jitter(a.col, a.row, 1 + salt, TILE * 0.28, TILE * 0.38);
		const spring = jitter(a.col, a.row, 2 + salt, TILE * 0.95, TILE * 1.25);
		const shape = archShape(openHW, spring);
		const g = new THREE.ExtrudeGeometry(shape, {
			depth,
			bevelEnabled: false,
			curveSegments: 6,
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

const TRIM_W = TILE * 0.06;
const TRIM_DEPTH_MULT = 1.3;
const TRIM_INSET = 0.025;

// Molding ring hugging the arch hole: outer contour = hole offset by TRIM_W,
// inner edge lips TRIM_INSET into the opening — sharing the arch's exact
// reveal surface would z-fight through the panel thickness. Extruded deeper
// than the arch panel so the trim sits proud of both faces.
function trimShape(openHW: number, spring: number): THREE.Shape {
	const sink = TILE * 0.3;
	const o = openHW + TRIM_W;
	const i = openHW - TRIM_INSET;
	const s = new THREE.Shape();
	s.moveTo(-o, -sink);
	s.lineTo(o, -sink);
	s.lineTo(o, spring);
	s.absarc(0, spring, o, 0, Math.PI, false);
	s.lineTo(-o, -sink);
	const hole = new THREE.Path();
	hole.moveTo(-i, -sink);
	hole.lineTo(i, -sink);
	hole.lineTo(i, spring);
	hole.absarc(0, spring, i, 0, Math.PI, false);
	hole.lineTo(-i, -sink);
	s.holes.push(hole);
	return s;
}

export function buildTrims(grid: Grid, variant = 0): THREE.BufferGeometry {
	const arches = archTiles(grid);
	if (!arches.length) return new THREE.BufferGeometry();

	const depth = TILE * 0.16 * TRIM_DEPTH_MULT;
	const parts: THREE.BufferGeometry[] = [];

	for (const a of arches) {
		const salt = variant * ARCH_SALT;
		const openHW = jitter(a.col, a.row, 1 + salt, TILE * 0.28, TILE * 0.38);
		const spring = jitter(a.col, a.row, 2 + salt, TILE * 0.95, TILE * 1.25);
		const g = new THREE.ExtrudeGeometry(trimShape(openHW, spring), {
			depth,
			bevelEnabled: false,
			curveSegments: 6,
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
