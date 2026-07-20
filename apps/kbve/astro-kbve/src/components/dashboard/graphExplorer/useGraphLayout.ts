import { useEffect, useState } from 'react';

export interface Community {
	id: number;
	x: number;
	y: number;
	r: number;
	count: number;
}

export interface GraphNode {
	i: number;
	c: number;
	x: number;
	y: number;
	d: number;
	l: string;
	f: string;
}

export type Edge = [number, number, number];

export interface LayeredGraph {
	meta: {
		nodes: number;
		edges: number;
		communities: number;
		built_at_commit: string;
	};
	communities: Community[];
	nodes: GraphNode[];
	edges: Edge[];
	communityEdges: Edge[];
}

interface State {
	data: LayeredGraph | null;
	loading: boolean;
	error: string | null;
}

/**
 * Fetch the precomputed layered graph JSON produced by
 * `graphify_layout.py`. The payload is static (served from `public/`), so a
 * single fetch on mount is enough.
 */
export function useGraphLayout(
	url = '/graphify/graph-layered.json',
): State {
	const [state, setState] = useState<State>({
		data: null,
		loading: true,
		error: null,
	});

	useEffect(() => {
		let alive = true;
		fetch(url)
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json();
			})
			.then((data: LayeredGraph) => {
				if (alive) setState({ data, loading: false, error: null });
			})
			.catch((e: unknown) => {
				if (alive)
					setState({
						data: null,
						loading: false,
						error: e instanceof Error ? e.message : 'load failed',
					});
			});
		return () => {
			alive = false;
		};
	}, [url]);

	return state;
}

/** Deterministic HSL color for a community id (stable across renders). */
export function communityColor(id: number): [number, number, number] {
	const hue = (id * 137.508) % 360;
	return hslToRgb(hue / 360, 0.6, 0.6);
}

function hslToRgb(
	h: number,
	s: number,
	l: number,
): [number, number, number] {
	if (s === 0) return [l, l, l];
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	const hue2rgb = (t: number) => {
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1 / 6) return p + (q - p) * 6 * t;
		if (t < 1 / 2) return q;
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
		return p;
	};
	return [hue2rgb(h + 1 / 3), hue2rgb(h), hue2rgb(h - 1 / 3)];
}
