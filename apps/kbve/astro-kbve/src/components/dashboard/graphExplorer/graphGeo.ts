import * as THREE from 'three';
import { REL_COLORS, type Edge } from './useMonorepoGraph';

interface Pt {
	x: number;
	y: number;
}

/**
 * Build a vertex-colored line geometry for a set of edges. Each segment is
 * tinted by its relation bucket and dimmed toward faint for low-weight edges,
 * so stronger coupling reads brighter. Optionally restrict to a predicate
 * (used for hover-highlight sub-geometries).
 */
export function buildEdgeGeo(
	nodes: Pt[],
	edges: Edge[],
	z: number,
	opts: { keep?: (e: Edge, i: number) => boolean; minBright?: number } = {},
): THREE.BufferGeometry {
	const keep = opts.keep ?? (() => true);
	const minBright = opts.minBright ?? 0.35;
	const kept: Edge[] = [];
	let maxW = 1;
	edges.forEach((e, i) => {
		if (!keep(e, i)) return;
		kept.push(e);
		if (e[2] > maxW) maxW = e[2];
	});
	const pos = new Float32Array(kept.length * 6);
	const col = new Float32Array(kept.length * 6);
	const logMax = Math.log(maxW + 1) || 1;
	kept.forEach(([a, b, w, rel], k) => {
		const na = nodes[a];
		const nb = nodes[b];
		if (!na || !nb) return;
		pos.set([na.x, na.y, z, nb.x, nb.y, z], k * 6);
		const [r, g, bl] = REL_COLORS[rel] ?? REL_COLORS[REL_COLORS.length - 1];
		const bright = minBright + (1 - minBright) * (Math.log(w + 1) / logMax);
		col.set(
			[r * bright, g * bright, bl * bright, r * bright, g * bright, bl * bright],
			k * 6,
		);
	});
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
	geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
	return geo;
}

/** Adjacency sets keyed by node index, from an edge list. */
export function buildAdjacency(edges: Edge[]): Map<number, Set<number>> {
	const adj = new Map<number, Set<number>>();
	const add = (a: number, b: number) => {
		let s = adj.get(a);
		if (!s) adj.set(a, (s = new Set()));
		s.add(b);
	};
	for (const [a, b] of edges) {
		add(a, b);
		add(b, a);
	}
	return adj;
}

/** GitHub blob URL for a source file (+ optional line) on the dev branch. */
export function githubUrl(path: string, loc?: string): string {
	const line = loc && /^L\d+/.test(loc) ? `#${loc.split('-')[0]}` : '';
	return `https://github.com/KBVE/kbve/blob/dev/${path}${line}`;
}
