import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COLS, MAP, ROWS, TILE } from './level';

const SEG = 8;
const WALL_TEX_COUNT = 3;
const HALF = TILE / 2;
const TEXEL = 1 / 256;
const INSET = TEXEL * 0.5;

function insetUV(g: THREE.BufferGeometry): void {
	const uv = g.attributes.uv as THREE.BufferAttribute;
	for (let i = 0; i < uv.count; i++) {
		uv.setXY(
			i,
			INSET + uv.getX(i) * (1 - 2 * INSET),
			INSET + uv.getY(i) * (1 - 2 * INSET),
		);
	}
	uv.needsUpdate = true;
}

function isSolid(col: number, row: number): boolean {
	if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return true;
	return MAP[row][col] === 1;
}

function texBucket(col: number, row: number): number {
	return (col * 3 + row * 5) % WALL_TEX_COUNT;
}

type Dir = { dc: number; dr: number; rotY: number; ox: number; oz: number };

const DIRS: Dir[] = [
	{ dc: 0, dr: -1, rotY: 0, ox: 0, oz: -HALF },
	{ dc: 0, dr: 1, rotY: Math.PI, ox: 0, oz: HALF },
	{ dc: -1, dr: 0, rotY: Math.PI / 2, ox: -HALF, oz: 0 },
	{ dc: 1, dr: 0, rotY: -Math.PI / 2, ox: HALF, oz: 0 },
];

export function buildWalls(): THREE.BufferGeometry[] {
	const buckets: THREE.BufferGeometry[][] = Array.from(
		{ length: WALL_TEX_COUNT },
		() => [],
	);

	for (let row = 0; row < ROWS; row++) {
		for (let col = 0; col < COLS; col++) {
			if (isSolid(col, row)) continue;
			const cx = col * TILE + HALF;
			const cz = row * TILE + HALF;
			for (const d of DIRS) {
				if (!isSolid(col + d.dc, row + d.dr)) continue;
				const quad = new THREE.PlaneGeometry(TILE, TILE, SEG, SEG);
				insetUV(quad);
				const m = new THREE.Matrix4()
					.makeTranslation(cx + d.ox, HALF, cz + d.oz)
					.multiply(new THREE.Matrix4().makeRotationY(d.rotY));
				quad.applyMatrix4(m);
				buckets[texBucket(col + d.dc, row + d.dr)].push(quad);
			}
		}
	}

	return buckets.map((geos) =>
		geos.length ? mergeGeometries(geos, false) : new THREE.BufferGeometry(),
	);
}

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
	return buildSlab(TILE, true);
}
