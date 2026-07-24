import { useCallback, useEffect, useRef, useState } from 'react';

export interface DirNode {
	id: string;
	label: string;
	x: number;
	y: number;
	r: number;
	n: number;
	files: number;
	c: number;
	/** Doc reference for this code area (e.g. ``/application/rust/``). */
	ref?: string;
	/** NX projects rooted in this directory (unified-graph overlay). */
	nx?: { projects: { name: string; type?: string }[] };
}

/** Edge as emitted by graphify_tiered.py: [source, target, weight, relIdx]. */
export type Edge = [number, number, number, number];

export interface Overview {
	meta: {
		dirs: number;
		files: number;
		symbols: number;
		dirEdges: number;
		built_at_commit: string;
		scale: number;
		relations: string[];
	};
	dirs: DirNode[];
	dirEdges: Edge[];
}

export interface FileNode {
	i: number;
	label: string;
	path: string;
	x: number;
	y: number;
	n: number;
}

export interface SymbolNode {
	i: number;
	f: number;
	label: string;
	x: number;
	y: number;
	c: number;
	loc: string;
}

export interface DirChunk {
	dir: string;
	center: [number, number];
	r: number;
	files: FileNode[];
	symbols: SymbolNode[];
	fileEdges: Edge[];
	symbolEdges: Edge[];
}

/** Palette for edge relation buckets (index matches meta.relations order). */
export const REL_COLORS: [number, number, number][] = [
	[0.4, 0.8, 1.0], // imports    — cyan
	[1.0, 0.72, 0.3], // calls     — amber
	[0.62, 0.62, 0.72], // references — grey
	[0.5, 0.85, 0.55], // contains  — green
	[0.95, 0.5, 0.85], // extends   — magenta
	[0.45, 0.5, 0.62], // other     — slate
	[0.72, 0.4, 1.0], // depends   — violet (NX project deps)
];

export const REL_LABELS = [
	'imports',
	'calls',
	'references',
	'contains',
	'extends',
	'other',
	'depends',
];

interface State {
	overview: Overview | null;
	loading: boolean;
	error: string | null;
}

/**
 * Loads the tiered monorepo graph. The small ``overview.json`` (one bubble per
 * directory) is fetched on mount; per-directory chunks — carrying that
 * directory's files, symbols and intra edges — are fetched lazily via
 * ``loadDir`` and cached, so panning across the graph never re-downloads.
 */
export function useMonorepoGraph(base = '/graphify') {
	const [state, setState] = useState<State>({
		overview: null,
		loading: true,
		error: null,
	});
	const chunks = useRef(new Map<string, DirChunk>());
	const inflight = useRef(new Map<string, Promise<DirChunk | null>>());
	const [, force] = useState(0);

	useEffect(() => {
		let alive = true;
		fetch(`${base}/overview.json`)
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json();
			})
			.then((overview: Overview) => {
				if (alive) setState({ overview, loading: false, error: null });
			})
			.catch((e: unknown) => {
				if (alive)
					setState({
						overview: null,
						loading: false,
						error: e instanceof Error ? e.message : 'load failed',
					});
			});
		return () => {
			alive = false;
		};
	}, [base]);

	const loadDir = useCallback(
		(slug: string): Promise<DirChunk | null> => {
			if (chunks.current.has(slug))
				return Promise.resolve(chunks.current.get(slug)!);
			if (inflight.current.has(slug)) return inflight.current.get(slug)!;
			const p = fetch(`${base}/dir/${slug}.json`)
				.then((r) => {
					if (!r.ok) throw new Error(`HTTP ${r.status}`);
					return r.json();
				})
				.then((chunk: DirChunk) => {
					chunks.current.set(slug, chunk);
					inflight.current.delete(slug);
					force((n) => n + 1);
					return chunk;
				})
				.catch(() => {
					inflight.current.delete(slug);
					return null;
				});
			inflight.current.set(slug, p);
			return p;
		},
		[base],
	);

	const getChunk = useCallback(
		(slug: string) => chunks.current.get(slug) ?? null,
		[],
	);

	return { ...state, loadDir, getChunk };
}

/** Deterministic HSL→RGB color for a community id (stable across renders). */
export function communityColor(id: number): [number, number, number] {
	const hue = (id * 137.508) % 360;
	return hslToRgb(hue / 360, 0.62, 0.6);
}

/** Deterministic color for a directory index (evenly spaced hues). */
export function dirColor(
	index: number,
	total: number,
): [number, number, number] {
	return hslToRgb((index / Math.max(total, 1)) % 1, 0.55, 0.62);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	if (s === 0) return [l, l, l];
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
}

function hue(p: number, q: number, t: number): number {
	if (t < 0) t += 1;
	if (t > 1) t -= 1;
	if (t < 1 / 6) return p + (q - p) * 6 * t;
	if (t < 1 / 2) return q;
	if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
	return p;
}
