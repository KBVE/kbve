import * as THREE from 'three';
import { COLS, MAP, ROWS } from '../level';
import { TILE } from '../config';

const HALF = TILE / 2;

export interface Dir {
	dc: number;
	dr: number;
	rotY: number;
	ox: number;
	oz: number;
}

export const DIRS: Dir[] = [
	{ dc: 0, dr: -1, rotY: 0, ox: 0, oz: -HALF },
	{ dc: 0, dr: 1, rotY: Math.PI, ox: 0, oz: HALF },
	{ dc: -1, dr: 0, rotY: Math.PI / 2, ox: -HALF, oz: 0 },
	{ dc: 1, dr: 0, rotY: -Math.PI / 2, ox: HALF, oz: 0 },
];

export interface Face {
	col: number;
	row: number;
	dir: Dir;
	di: number;
}

export function isSolid(col: number, row: number): boolean {
	if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return true;
	return MAP[row][col] === 1;
}

export function exposedFaces(): Face[] {
	const out: Face[] = [];
	for (let row = 0; row < ROWS; row++) {
		for (let col = 0; col < COLS; col++) {
			if (isSolid(col, row)) continue;
			for (let di = 0; di < DIRS.length; di++) {
				const dir = DIRS[di];
				if (isSolid(col + dir.dc, row + dir.dr))
					out.push({ col, row, dir, di });
			}
		}
	}
	return out;
}

export function isBay(face: Face): boolean {
	return (face.col * 11 + face.row * 17 + face.di * 3) % 5 === 0;
}

export function faceMatrix(face: Face, y: number): THREE.Matrix4 {
	const cx = face.col * TILE + HALF;
	const cz = face.row * TILE + HALF;
	return new THREE.Matrix4()
		.makeTranslation(cx + face.dir.ox, y, cz + face.dir.oz)
		.multiply(new THREE.Matrix4().makeRotationY(face.dir.rotY));
}
