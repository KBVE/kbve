import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TILE, WALL_H } from '../config';
import { WALL_TEX_COUNT } from './walls';
import type { ColumnSlot } from '../dungeon/generate';

// Vertical silhouette (radiusFactor, y) lathed around Y — flared base at the floor,
// straight shaft, then a curved neck flaring to a capital under the ceiling. Four
// presets so each room can own a distinct look. LatheGeometry gives consistent
// outward winding + normals + UVs, so columns render solid FrontSide (no smear).
interface Style {
	sides: number;
	baseR: number;
	pts: [number, number][];
}

const H = WALL_H;

const STYLES: Style[] = [
	{
		sides: 8,
		baseR: 0.34,
		pts: [
			[1.7, 0],
			[1.7, 0.35],
			[1.15, 0.55],
			[1.0, 0.7],
			[1.0, H - 1.0],
			[1.05, H - 0.8],
			[1.25, H - 0.55],
			[1.5, H - 0.35],
			[1.6, H - 0.2],
			[1.6, H - 0.05],
			[1.7, H],
		],
	},
	{
		sides: 4,
		baseR: 0.42,
		pts: [
			[1.7, 0],
			[1.7, 0.3],
			[1.3, 0.42],
			[1.0, 0.58],
			[1.0, H - 0.7],
			[1.45, H - 0.5],
			[1.45, H - 0.34],
			[1.0, H - 0.34],
			[1.0, H - 0.24],
			[1.7, H - 0.12],
			[1.7, H],
		],
	},
	{
		sides: 6,
		baseR: 0.3,
		pts: [
			[1.8, 0],
			[1.8, 0.4],
			[1.1, 0.6],
			[1.0, 0.78],
			[1.0, H * 0.5 - 0.12],
			[1.3, H * 0.5],
			[1.0, H * 0.5 + 0.12],
			[1.0, H - 0.9],
			[1.1, H - 0.7],
			[1.35, H - 0.45],
			[1.55, H - 0.25],
			[1.55, H - 0.05],
			[1.75, H],
		],
	},
	{
		sides: 8,
		baseR: 0.44,
		pts: [
			[1.6, 0],
			[1.6, 0.4],
			[1.15, 0.62],
			[1.0, 0.82],
			[1.0, H - 1.2],
			[1.05, H - 1.0],
			[1.25, H - 0.7],
			[1.5, H - 0.45],
			[1.65, H - 0.25],
			[1.65, H - 0.05],
			[1.75, H],
		],
	},
];

const MAX_SEG = 4;

// Insert interpolated rings so no vertical run is longer than MAX_SEG. The old
// 0.5 cap existed for the affine PSX warp (long thin quads streaked); with
// affine retired only a coarse cap remains for normal quality on tall shafts.
function densify(pts: THREE.Vector2[]): THREE.Vector2[] {
	const out: THREE.Vector2[] = [pts[0]];
	for (let i = 1; i < pts.length; i++) {
		const a = pts[i - 1];
		const b = pts[i];
		const n = Math.max(1, Math.ceil(Math.abs(b.y - a.y) / MAX_SEG));
		for (let k = 1; k <= n; k++)
			out.push(new THREE.Vector2().lerpVectors(a, b, k / n));
	}
	return out;
}

// Shaft radius of a style (the rf=1.0 rings) — used to mount a sconce torch flush
// against the surface instead of floating in the tile.
export function columnShaftRadius(style: number): number {
	return STYLES[style % STYLES.length].baseR;
}

function columnGeo(
	cx: number,
	cz: number,
	style: number,
): THREE.BufferGeometry {
	const s = STYLES[style % STYLES.length];
	const profile = densify(
		s.pts.map(
			([rf, y]) => new THREE.Vector2(Math.max(0.001, s.baseR * rf), y),
		),
	);
	const g = new THREE.LatheGeometry(profile, s.sides);
	// Lathe UVs run 0..1; tile them so the wall texture reads at a sane scale.
	const uv = g.attributes.uv as THREE.BufferAttribute;
	for (let i = 0; i < uv.count; i++)
		uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * (H / TILE));
	uv.needsUpdate = true;
	g.translate(cx, 0, cz);
	return g;
}

// One merged geometry per wall-texture bucket (mirrors buildWalls), so a column
// renders with the same atlas as its room's walls.
export function buildColumns(columns: ColumnSlot[]): THREE.BufferGeometry[] {
	const buckets: THREE.BufferGeometry[][] = Array.from(
		{ length: WALL_TEX_COUNT },
		() => [],
	);

	for (const c of columns) {
		const cx = (c.col + 0.5) * TILE;
		const cz = (c.row + 0.5) * TILE;
		buckets[c.tex % WALL_TEX_COUNT].push(columnGeo(cx, cz, c.style));
	}

	return buckets.map((geos) => {
		if (!geos.length) return new THREE.BufferGeometry();
		const merged = mergeGeometries(geos, false);
		for (const g of geos) g.dispose();
		return merged ?? new THREE.BufferGeometry();
	});
}
