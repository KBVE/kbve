import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSiteGraph } from './cache';
import type { SiteGraphData } from '../types';
import {
	type GraphNode,
	type GraphLink,
	getNeighborhood,
	buildAdjacency,
} from './graph-core';

export interface Neighborhood {
	graphData: SiteGraphData | null;
	error: string | null;
	/** Re-fetch the graph (used by the error-state retry button). */
	retry: () => void;
	nodes: GraphNode[];
	links: GraphLink[];
	adjacency: Map<string, Set<string>>;
	distinctTags: string[];
	distinctRelationships: string[];
}

/**
 * Fetches the site graph (cached, worker-shared) and derives the current
 * neighborhood for `currentSlug` at `depth`. The BFS + adjacency + distinct
 * tag/relationship sets are memoized so hover/zoom/search re-renders never
 * recompute them — they depend only on the graph, slug, depth, and `tagOf`.
 *
 * NOTE: `tagOf` is a memo dependency — consumers must pass a stable reference
 * (module-level fn or `useCallback`), or the neighborhood recomputes on every
 * render.
 */
export function useNeighborhood(
	currentSlug: string,
	depth: number,
	tagOf: (slug: string) => string | null,
	endpoint?: string,
): Neighborhood {
	const [graphData, setGraphData] = useState<SiteGraphData | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [retryNonce, setRetryNonce] = useState(0);

	const retry = useCallback(() => setRetryNonce((n) => n + 1), []);

	useEffect(() => {
		let cancelled = false;
		setError(null);
		fetchSiteGraph(endpoint)
			.then((data) => {
				if (!cancelled) setGraphData(data);
			})
			.catch((err) => {
				if (!cancelled)
					setError(err instanceof Error ? err.message : String(err));
			});
		return () => {
			cancelled = true;
		};
	}, [endpoint, retryNonce]);

	// Memoize neighborhood so adjacency + render don't recompute every keystroke.
	const { nodes, links, adjacency } = useMemo(() => {
		if (!graphData)
			return {
				nodes: [] as GraphNode[],
				links: [] as GraphLink[],
				adjacency: new Map<string, Set<string>>(),
			};
		const result = getNeighborhood(graphData, currentSlug, depth, tagOf);
		return {
			...result,
			adjacency: buildAdjacency(result.links),
		};
	}, [graphData, currentSlug, depth, tagOf]);

	// Distinct tags / relationships drive the cluster legend below the SVG.
	const distinctTags = useMemo(
		() => [
			...new Set(nodes.map((n) => n.tag).filter((t): t is string => !!t)),
		],
		[nodes],
	);
	const distinctRelationships = useMemo(
		() => [
			...new Set(
				links
					.map((l) => l.relationship)
					.filter((r): r is string => !!r),
			),
		],
		[links],
	);

	return {
		graphData,
		error,
		retry,
		nodes,
		links,
		adjacency,
		distinctTags,
		distinctRelationships,
	};
}
