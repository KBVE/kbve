import { useEffect, useRef, useState, useCallback } from 'react';
import {
	forceSimulation,
	forceLink,
	forceManyBody,
	forceCenter,
	forceCollide,
	type SimulationNodeDatum,
	type SimulationLinkDatum,
} from 'd3-force';

interface SiteGraphNode {
	title: string;
	links: string[];
	backlinks: string[];
}

type SiteGraphData = Record<string, SiteGraphNode>;

interface GraphNode extends SimulationNodeDatum {
	id: string;
	title: string;
	isCurrent: boolean;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
	source: GraphNode;
	target: GraphNode;
}

interface SiteGraphProps {
	currentSlug: string;
	depth?: number;
	width?: number;
	height?: number;
}

/** BFS to collect neighborhood around the current page. */
function getNeighborhood(
	graph: SiteGraphData,
	startSlug: string,
	maxDepth: number,
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
		nodeMap.set(slug, {
			id: slug,
			title: entry.title,
			isCurrent: slug === startSlug,
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
				});
			}
		}
	}

	return { nodes: [...nodeMap.values()], links };
}

export default function SiteGraph({
	currentSlug,
	depth = 2,
	width = 280,
	height = 280,
}: SiteGraphProps) {
	const svgRef = useRef<SVGSVGElement>(null);
	const [graphData, setGraphData] = useState<SiteGraphData | null>(null);
	const [error, setError] = useState<string | null>(null);
	const simulationRef = useRef<ReturnType<typeof forceSimulation> | null>(
		null,
	);

	// Fetch sitemap data
	useEffect(() => {
		let cancelled = false;
		fetch('/api/sitegraph.json')
			.then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			})
			.then((data: SiteGraphData) => {
				if (!cancelled) setGraphData(data);
			})
			.catch((err) => {
				if (!cancelled) setError(err.message);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	// Run d3-force simulation
	useEffect(() => {
		if (!graphData || !svgRef.current) return;

		const { nodes, links } = getNeighborhood(graphData, currentSlug, depth);
		if (nodes.length === 0) return;

		const svg = svgRef.current;

		const simulation = forceSimulation<GraphNode>(nodes)
			.force(
				'link',
				forceLink<GraphNode, GraphLink>(links)
					.id((d) => d.id)
					.distance(50),
			)
			.force('charge', forceManyBody().strength(-120))
			.force('center', forceCenter(width / 2, height / 2))
			.force('collide', forceCollide(18));

		simulationRef.current = simulation;

		simulation.on('tick', () => {
			// Update link positions
			const linkEls = svg.querySelectorAll<SVGLineElement>('.sg-link');
			links.forEach((link, i) => {
				if (linkEls[i]) {
					linkEls[i].setAttribute('x1', String(link.source.x ?? 0));
					linkEls[i].setAttribute('y1', String(link.source.y ?? 0));
					linkEls[i].setAttribute('x2', String(link.target.x ?? 0));
					linkEls[i].setAttribute('y2', String(link.target.y ?? 0));
				}
			});

			// Update node positions
			const nodeEls = svg.querySelectorAll<SVGGElement>('.sg-node');
			nodes.forEach((node, i) => {
				if (nodeEls[i]) {
					nodeEls[i].setAttribute(
						'transform',
						`translate(${node.x ?? 0},${node.y ?? 0})`,
					);
				}
			});
		});

		return () => {
			simulation.stop();
			simulationRef.current = null;
		};
	}, [graphData, currentSlug, depth, width, height]);

	const handleNodeClick = useCallback(
		(slug: string) => {
			if (slug !== currentSlug) {
				window.location.href = `/${slug}/`;
			}
		},
		[currentSlug],
	);

	if (error) {
		return (
			<div
				className="sg-error"
				style={{
					padding: '8px',
					fontSize: '12px',
					color: 'var(--sl-color-gray-4)',
				}}>
				Graph unavailable
			</div>
		);
	}

	if (!graphData) {
		return (
			<div
				className="sg-loading"
				style={{
					padding: '8px',
					fontSize: '12px',
					color: 'var(--sl-color-gray-4)',
				}}>
				Loading graph...
			</div>
		);
	}

	const { nodes, links } = getNeighborhood(graphData, currentSlug, depth);

	if (nodes.length === 0) {
		return (
			<div
				className="sg-empty"
				style={{
					padding: '8px',
					fontSize: '12px',
					color: 'var(--sl-color-gray-4)',
				}}>
				No connections
			</div>
		);
	}

	return (
		<svg
			ref={svgRef}
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			style={{
				width: '100%',
				height: `${height}px`,
				background: 'var(--sl-color-bg-nav)',
				borderRadius: '8px',
				cursor: 'grab',
			}}>
			{/* Links */}
			{links.map((link, i) => (
				<line
					key={`link-${i}`}
					className="sg-link"
					stroke="var(--sl-color-gray-5)"
					strokeWidth={1}
					strokeOpacity={0.4}
				/>
			))}

			{/* Nodes */}
			{nodes.map((node, i) => (
				<g
					key={node.id}
					className="sg-node"
					style={{ cursor: 'pointer' }}
					onClick={() => handleNodeClick(node.id)}>
					<circle
						r={node.isCurrent ? 6 : 4}
						fill={
							node.isCurrent
								? 'var(--sl-color-accent)'
								: 'var(--sl-color-white)'
						}
						stroke={
							node.isCurrent
								? 'var(--sl-color-accent-high)'
								: 'var(--sl-color-gray-4)'
						}
						strokeWidth={node.isCurrent ? 2 : 1}
					/>
					<title>{node.title}</title>
					{node.isCurrent && (
						<text
							dy={-10}
							textAnchor="middle"
							fill="var(--sl-color-white)"
							fontSize={10}
							fontWeight={600}
							style={{ pointerEvents: 'none' }}>
							{node.title.length > 20
								? node.title.slice(0, 18) + '...'
								: node.title}
						</text>
					)}
				</g>
			))}
		</svg>
	);
}
