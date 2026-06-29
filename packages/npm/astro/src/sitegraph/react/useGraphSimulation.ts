import { useEffect, useRef, type RefObject } from 'react';
import {
	forceSimulation,
	forceLink,
	forceManyBody,
	forceCenter,
	forceCollide,
	forceX,
	forceY,
	type Simulation,
} from 'd3-force';
import {
	type GraphNode,
	type GraphLink,
	ALPHA_MIN,
	ALPHA_DECAY,
	curvedEdgePath,
} from './graph-core';

/**
 * Runs the d3-force layout for the current neighborhood and writes node/link
 * positions straight to the DOM on each tick (cached element lists, no React
 * re-render). The simulation only ticks while the tab is visible AND the graph
 * is on screen; it is hard-stopped on SPA swap / page hide so no rAF loop
 * survives an unmount. Returns the live simulation ref for node dragging.
 */
export function useGraphSimulation(
	svgRef: RefObject<SVGSVGElement | null>,
	containerRef: RefObject<HTMLDivElement | null>,
	graphReady: boolean,
	nodes: GraphNode[],
	links: GraphLink[],
	width: number,
	height: number,
	reducedMotion: boolean,
): RefObject<Simulation<GraphNode, GraphLink> | null> {
	const simulationRef = useRef<Simulation<GraphNode, GraphLink> | null>(null);

	useEffect(() => {
		if (!graphReady || !svgRef.current || nodes.length === 0) return;

		const svg = svgRef.current;

		// Group nodes by tag for cluster forces — pulls same-tag nodes toward
		// the same anchor so users can spot domain clusters at a glance.
		const tagAnchors = new Map<string, { x: number; y: number }>();
		const distinctTags = [
			...new Set(nodes.map((n) => n.tag).filter((t): t is string => !!t)),
		];
		distinctTags.forEach((tag, i) => {
			const angle = (i / Math.max(distinctTags.length, 1)) * Math.PI * 2;
			const radius = Math.min(width, height) * 0.25;
			tagAnchors.set(tag, {
				x: width / 2 + Math.cos(angle) * radius,
				y: height / 2 + Math.sin(angle) * radius,
			});
		});

		const simulation = forceSimulation<GraphNode>(nodes)
			.alphaMin(reducedMotion ? 0.5 : ALPHA_MIN)
			.alphaDecay(reducedMotion ? 0.4 : ALPHA_DECAY)
			.force(
				'link',
				forceLink<GraphNode, GraphLink>(links)
					.id((d) => d.id)
					.distance(50),
			)
			.force('charge', forceManyBody().strength(-120))
			.force('center', forceCenter(width / 2, height / 2))
			.force('collide', forceCollide(24));

		if (distinctTags.length >= 2) {
			simulation
				.force(
					'cluster-x',
					forceX<GraphNode>((d) =>
						d.tag
							? (tagAnchors.get(d.tag)?.x ?? width / 2)
							: width / 2,
					).strength(0.06),
				)
				.force(
					'cluster-y',
					forceY<GraphNode>((d) =>
						d.tag
							? (tagAnchors.get(d.tag)?.y ?? height / 2)
							: height / 2,
					).strength(0.06),
				);
		}

		simulationRef.current = simulation;

		// Cache the element lists once. React rendered the nodes/links before
		// this effect runs, and the effect re-runs whenever nodes/links change,
		// so a per-tick querySelectorAll (hundreds of nodes × 60fps on a phone)
		// is pure waste. Snapshot here, index into it on tick.
		const linkEls = svg.querySelectorAll<SVGPathElement>('.sg-link');
		const nodeEls = svg.querySelectorAll<SVGGElement>('.sg-node');

		simulation.on('tick', () => {
			for (let i = 0; i < links.length; i++) {
				const el = linkEls[i];
				if (el) {
					el.setAttribute(
						'd',
						curvedEdgePath(links[i].source, links[i].target),
					);
				}
			}
			for (let i = 0; i < nodes.length; i++) {
				const el = nodeEls[i];
				if (el) {
					el.setAttribute(
						'transform',
						`translate(${nodes[i].x ?? 0},${nodes[i].y ?? 0})`,
					);
				}
			}
		});

		// Battery/CPU: only let the layout tick when the tab is visible AND the
		// graph is actually on screen. The sidebar graph is frequently scrolled
		// out of view or backgrounded on mobile — no reason to keep simulating.
		let docVisible =
			typeof document === 'undefined' ? true : !document.hidden;
		let inView = true;
		const applyRunState = () => {
			if (docVisible && inView) simulation.restart();
			else simulation.stop();
		};
		const onVisibility = () => {
			docVisible = !document.hidden;
			applyRunState();
		};
		document.addEventListener('visibilitychange', onVisibility);

		let io: IntersectionObserver | null = null;
		const container = containerRef.current;
		if (container && typeof IntersectionObserver !== 'undefined') {
			io = new IntersectionObserver(
				(entries) => {
					inView = entries.some((e) => e.isIntersecting);
					applyRunState();
				},
				{ threshold: 0 },
			);
			io.observe(container);
		}

		// Belt-and-suspenders: if a future Astro/React change ever fails to fire
		// the island's unmount (which runs this cleanup), still halt the
		// simulation on SPA swap / page hide so a stale rAF loop can't survive.
		const killOnSwap = () => simulation.stop();
		document.addEventListener('astro:before-swap', killOnSwap, {
			once: true,
		});
		window.addEventListener('pagehide', killOnSwap, { once: true });

		return () => {
			simulation.stop();
			simulationRef.current = null;
			document.removeEventListener('visibilitychange', onVisibility);
			document.removeEventListener('astro:before-swap', killOnSwap);
			window.removeEventListener('pagehide', killOnSwap);
			io?.disconnect();
		};
	}, [
		svgRef,
		containerRef,
		graphReady,
		nodes,
		links,
		width,
		height,
		reducedMotion,
	]);

	return simulationRef;
}
