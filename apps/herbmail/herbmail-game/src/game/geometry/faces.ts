import * as THREE from 'three';
import { TILE } from '../config';
import { ARCH, DOORWAY, gridSolid, gridTile, type Grid } from './grid';

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

export function worldCol(grid: Grid, face: Face): number {
	return grid.originCol + face.col;
}

export function worldRow(grid: Grid, face: Face): number {
	return grid.originRow + face.row;
}

export function exposedFaces(grid: Grid): Face[] {
	const out: Face[] = [];
	for (let row = 0; row < grid.rows; row++) {
		for (let col = 0; col < grid.cols; col++) {
			if (gridSolid(grid, col, row)) continue;
			for (let di = 0; di < DIRS.length; di++) {
				const dir = DIRS[di];
				if (gridSolid(grid, col + dir.dc, row + dir.dr))
					out.push({ col, row, dir, di });
			}
		}
	}
	return out;
}

export function isBay(grid: Grid, face: Face, variant = 0): boolean {
	// Never carve a niche into a doorway jamb: the face's open tile being an
	// arch means we're inside the door threshold, and a recess there reads as
	// a random hole behind the leaf.
	if ((gridTile(grid, face.col, face.row) & DOORWAY) !== 0) return false;
	const c = worldCol(grid, face);
	const r = worldRow(grid, face);
	return (((c * 11 + r * 17 + face.di * 3 + variant * 23) % 5) + 5) % 5 === 0;
}

export function faceMatrix(grid: Grid, face: Face, y: number): THREE.Matrix4 {
	const cx = worldCol(grid, face) * TILE + HALF;
	const cz = worldRow(grid, face) * TILE + HALF;
	return new THREE.Matrix4()
		.makeTranslation(cx + face.dir.ox, y, cz + face.dir.oz)
		.multiply(new THREE.Matrix4().makeRotationY(face.dir.rotY));
}

export type ArchAxis = 'x' | 'z';

export interface ArchTile {
	col: number;
	row: number;
	axis: ArchAxis;
}

// A neighbor continues the wall line when it is solid rock OR another doorway
// tile — 3-wide connector gates are runs of ARCH tiles, and without counting
// them the middle tiles read as free-standing and their panels rotate 90°.
function wallish(grid: Grid, col: number, row: number): boolean {
	return (
		gridSolid(grid, col, row) || (gridTile(grid, col, row) & DOORWAY) !== 0
	);
}

export function archAxis(grid: Grid, col: number, row: number): ArchAxis {
	const ns = wallish(grid, col, row - 1) && wallish(grid, col, row + 1);
	return ns ? 'x' : 'z';
}

export function archTiles(grid: Grid): ArchTile[] {
	const out: ArchTile[] = [];
	for (let row = 0; row < grid.rows; row++) {
		for (let col = 0; col < grid.cols; col++) {
			if (gridTile(grid, col, row) !== ARCH) continue;
			out.push({
				col: grid.originCol + col,
				row: grid.originRow + row,
				axis: archAxis(grid, col, row),
			});
		}
	}
	return out;
}
