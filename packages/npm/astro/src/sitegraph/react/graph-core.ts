import type { SimulationNodeDatum, SimulationLinkDatum } from 'd3-force';
import type { SiteGraphData } from '../types';

export interface GraphNode extends SimulationNodeDatum {
	id: string;
	title: string;
	isCurrent: boolean;
	tag: string | null;
	degree: number;
}

export interface GraphLink extends SimulationLinkDatum<GraphNode> {
	source: GraphNode;
	target: GraphNode;
	relationship?: string;
}

export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 3;
export const ZOOM_SENSITIVITY = 0.002;

/** Zoom at/above which every node label reveals (declutter threshold). */
export const ZOOM_LABEL_THRESHOLD = 1.2;

/** d3-force tick budget — caps long-running simulations on dense neighborhoods. */
export const ALPHA_MIN = 0.05;
export const ALPHA_DECAY = 0.05;

/** localStorage key for the user's preferred neighborhood depth. */
const DEPTH_STORAGE_KEY = 'kbve-sitegraph-depth';

/** Reads the user's reduced-motion preference. SSR-safe. */
export function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined') return false;
	return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Reads + writes the depth selection to localStorage. */
export function loadStoredDepth(
	fallback: number,
	min: number,
	max: number,
): number {
	if (typeof localStorage === 'undefined') return fallback;
	const raw = localStorage.getItem(DEPTH_STORAGE_KEY);
	if (!raw) return fallback;
	const n = Number(raw);
	return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

export function persistDepth(depth: number): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(DEPTH_STORAGE_KEY, String(depth));
	} catch {
		// quota / disabled — ignore
	}
}

/** Reads sg-prefixed query params for shareable graph state. */
export function readUrlState(): { depth: number | null; q: string | null } {
	if (typeof window === 'undefined') return { depth: null, q: null };
	const params = new URLSearchParams(window.location.search);
	const depthRaw = params.get('sg-depth');
	const depth = depthRaw ? Number(depthRaw) : null;
	return {
		depth: depth !== null && Number.isFinite(depth) ? depth : null,
		q: params.get('sg-q'),
	};
}

export function writeUrlState(state: { depth: number; q: string }): void {
	if (typeof window === 'undefined') return;
	const params = new URLSearchParams(window.location.search);
	params.set('sg-depth', String(state.depth));
	if (state.q) params.set('sg-q', state.q);
	else params.delete('sg-q');
	const next = `${window.location.pathname}${
		params.toString() ? '?' + params.toString() : ''
	}${window.location.hash}`;
	window.history.replaceState(null, '', next);
}

export function getNeighborhood(
	graph: SiteGraphData,
	startSlug: string,
	maxDepth: number,
	tagOf: (slug: string) => string | null,
): { nodes: GraphNode[]; links: GraphLink[] } {
	const visited = new Set<string>();
	const queue: Array<{ slug: string; depth: number }> = [
		{ slug: startSlug, depth: 0 },
	];
	visited.add(startSlug);

	while (queue.length > 0) {
		const { slug, depth } = queue.shift()!;
		if (depth >= maxDepth) continue;

		const node = graph[slug];
		if (!node) continue;

		const neighbors = [...node.links, ...node.backlinks];
		for (const neighbor of neighbors) {
			if (!visited.has(neighbor) && graph[neighbor]) {
				visited.add(neighbor);
				queue.push({ slug: neighbor, depth: depth + 1 });
			}
		}
	}

	const nodeMap = new Map<string, GraphNode>();
	for (const slug of visited) {
		const entry = graph[slug];
		if (!entry) continue;
		const degree =
			(entry.links?.length ?? 0) + (entry.backlinks?.length ?? 0);
		nodeMap.set(slug, {
			id: slug,
			title: entry.title,
			isCurrent: slug === startSlug,
			tag: tagOf(slug),
			degree,
		});
	}

	const links: GraphLink[] = [];
	for (const slug of visited) {
		const entry = graph[slug];
		if (!entry) continue;
		for (const target of entry.links) {
			if (visited.has(target)) {
				links.push({
					source: nodeMap.get(slug)!,
					target: nodeMap.get(target)!,
					relationship: entry.edges?.[target],
				});
			}
		}
	}

	return { nodes: [...nodeMap.values()], links };
}

/**
 * Maps degree (links + backlinks) to a node radius. sqrt-scaled so a 100-link
 * hub doesn't dwarf the rest of the neighborhood.
 */
export function radiusForDegree(degree: number, base: number): number {
	const extra = Math.min(6, Math.sqrt(Math.max(degree - 1, 0)) * 1.2);
	return base + extra;
}

/**
 * Returns an SVG path for a quadratic bezier from `s` to `t`. The control
 * point is offset perpendicular to the segment by ~15% of its length so
 * dense graphs read as a fan of curves instead of overlapping lines.
 */
export function curvedEdgePath(
	s: { x?: number; y?: number },
	t: { x?: number; y?: number },
): string {
	const sx = s.x ?? 0;
	const sy = s.y ?? 0;
	const tx = t.x ?? 0;
	const ty = t.y ?? 0;
	const dx = tx - sx;
	const dy = ty - sy;
	const dist = Math.hypot(dx, dy) || 1;
	const offset = dist * 0.15;
	const mx = (sx + tx) / 2;
	const my = (sy + ty) / 2;
	// Perpendicular unit vector → control point.
	const cx = mx + (-dy / dist) * offset;
	const cy = my + (dx / dist) * offset;
	return `M${sx} ${sy} Q${cx} ${cy} ${tx} ${ty}`;
}

/**
 * Builds the neighbor lookup used for hover-dim. Lets us fade everything
 * except the hovered node + its immediate neighbors without re-running
 * BFS on every mouse-enter.
 */
export function buildAdjacency(links: GraphLink[]): Map<string, Set<string>> {
	const adj = new Map<string, Set<string>>();
	for (const l of links) {
		const a = l.source.id;
		const b = l.target.id;
		if (!adj.has(a)) adj.set(a, new Set());
		if (!adj.has(b)) adj.set(b, new Set());
		adj.get(a)!.add(b);
		adj.get(b)!.add(a);
	}
	return adj;
}
