import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COVE_R, TILE, WALL_H } from '../config';
import { DIRS, isBay } from './faces';
import { ARCH, gridSolid, gridTile, type Grid } from './grid';

const ARC_SEG = 4;
const H_SEG = 1;
const CAP_H = WALL_H - COVE_R;
const INSET = 0.09;

interface Corner {
	x0: number;
	z0: number;
	sx: number;
	sz: number;
}

function bayFace(
	grid: Grid,
	col: number,
	row: number,
	di: number,
	variant: number,
): boolean {
	return isBay(grid, { col, row, di, dir: DIRS[di] }, variant);
}

function cornersAt(
	grid: Grid,
	col: number,
	row: number,
	variant: number,
): Corner[] {
	const out: Corner[] = [];
	const n = gridSolid(grid, col, row - 1);
	const s = gridSolid(grid, col, row + 1);
	const w = gridSolid(grid, col - 1, row);
	const e = gridSolid(grid, col + 1, row);
	const x = (grid.originCol + col) * TILE;
	const z = (grid.originRow + row) * TILE;
	const bf = (di: number) => bayFace(grid, col, row, di, variant);
	if (n && w && !bf(0) && !bf(2)) out.push({ x0: x, z0: z, sx: 1, sz: 1 });
	if (n && e && !bf(0) && !bf(3))
		out.push({ x0: x + TILE, z0: z, sx: -1, sz: 1 });
	if (s && w && !bf(1) && !bf(2))
		out.push({ x0: x, z0: z + TILE, sx: 1, sz: -1 });
	if (s && e && !bf(1) && !bf(3))
		out.push({ x0: x + TILE, z0: z + TILE, sx: -1, sz: -1 });
	return out;
}

function keep(col: number, row: number, i: number, variant: number): boolean {
	return (((col * 7 + row * 13 + i * 5 + variant * 19) % 3) + 3) % 3 === 0;
}

function fillet(c: Corner): THREE.BufferGeometry {
	const R = COVE_R;
	const cx = c.x0 + c.sx * R;
	const cz = c.z0 + c.sz * R;
	const pos: number[] = [];
	const uv: number[] = [];
	const idx: number[] = [];

	for (let h = 0; h <= H_SEG; h++) {
		const y = (h / H_SEG) * CAP_H;
		for (let a = 0; a <= ARC_SEG; a++) {
			const th = (a / ARC_SEG) * (Math.PI / 2);
			const x = cx - c.sx * R * Math.cos(th) + c.sx * INSET;
			const z = cz - c.sz * R * Math.sin(th) + c.sz * INSET;
			pos.push(x, y, z);
			uv.push(a / ARC_SEG, y / CAP_H);
		}
	}

	const stride = ARC_SEG + 1;
	for (let h = 0; h < H_SEG; h++) {
		for (let a = 0; a < ARC_SEG; a++) {
			const i0 = h * stride + a;
			const i1 = i0 + 1;
			const i2 = i0 + stride;
			const i3 = i2 + 1;
			idx.push(i0, i2, i1, i1, i2, i3);
		}
	}

	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
	g.setIndex(idx);
	g.computeVertexNormals();
	return g;
}

export function buildCornerCoves(
	grid: Grid,
	variant = 0,
): THREE.BufferGeometry {
	const parts: THREE.BufferGeometry[] = [];
	for (let row = 0; row < grid.rows; row++) {
		for (let col = 0; col < grid.cols; col++) {
			if (gridSolid(grid, col, row)) continue;
			// Doorway tiles: every corner here pairs a real jamb with the
			// out-of-bounds passage side (phantom-solid), producing fillets that
			// hang in the opening. The arch mesh owns this tile.
			if (gridTile(grid, col, row) === ARCH) continue;
			cornersAt(grid, col, row, variant).forEach((c, i) => {
				const wc = grid.originCol + col;
				const wr = grid.originRow + row;
				if (keep(wc, wr, i, variant)) parts.push(fillet(c));
			});
		}
	}
	if (!parts.length) return new THREE.BufferGeometry();
	return mergeGeometries(parts, false);
}
