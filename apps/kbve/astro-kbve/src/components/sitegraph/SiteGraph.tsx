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
import { openTooltip, closeTooltip } from '@kbve/droid';

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

// ---------------------------------------------------------------------------
// Zoom constants
// ---------------------------------------------------------------------------
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
const ZOOM_SENSITIVITY = 0.002;

// ---------------------------------------------------------------------------
// BFS neighborhood
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SiteGraph({
	currentSlug,
	depth = 2,
	width = 280,
	height = 280,
}: SiteGraphProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const tooltipRef = useRef<HTMLDivElement>(null);
	const [graphData, setGraphData] = useState<SiteGraphData | null>(null);
	const [error, setError] = useState<string | null>(null);
	const simulationRef = useRef<ReturnType<typeof forceSimulation> | null>(
		null,
	);

	// Hovered node id for highlight styling
	const [hoveredId, setHoveredId] = useState<string | null>(null);

	// Zoom / pan state
	const [zoom, setZoom] = useState(1);
	const [panX, setPanX] = useState(0);
	const [panY, setPanY] = useState(0);

	// Track if pointer is over the SVG
	const isPointerOverSvg = useRef(false);

	// Refs for pinch tracking
	const lastPinchDist = useRef<number | null>(null);

	// ── Tooltip helpers (mutate persistent DOM element directly) ──

	const showTooltip = useCallback(
		(title: string, id: string, e: React.MouseEvent) => {
			const tip = tooltipRef.current;
			const container = containerRef.current;
			if (!tip || !container) return;

			const titleEl = tip.querySelector<HTMLDivElement>(
				'[data-sg-tip-title]',
			);
			const pathEl =
				tip.querySelector<HTMLDivElement>('[data-sg-tip-path]');
			if (titleEl) titleEl.textContent = title;
			if (pathEl) pathEl.textContent = `/${id}/`;

			const rect = container.getBoundingClientRect();
			tip.style.left = `${e.clientX - rect.left}px`;
			tip.style.top = `${e.clientY - rect.top}px`;
			tip.style.opacity = '1';
			tip.style.visibility = 'visible';
		},
		[],
	);

	const moveTooltip = useCallback((e: React.MouseEvent) => {
		const tip = tooltipRef.current;
		const container = containerRef.current;
		if (!tip || !container) return;

		const rect = container.getBoundingClientRect();
		tip.style.left = `${e.clientX - rect.left}px`;
		tip.style.top = `${e.clientY - rect.top}px`;
	}, []);

	const hideTooltip = useCallback(() => {
		const tip = tooltipRef.current;
		if (!tip) return;
		tip.style.opacity = '0';
		tip.style.visibility = 'hidden';
	}, []);

	// ── Fetch sitemap data ──
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

	// ── Run d3-force simulation ──
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
			.force('collide', forceCollide(24));

		simulationRef.current = simulation;

		simulation.on('tick', () => {
			const linkEls = svg.querySelectorAll<SVGLineElement>('.sg-link');
			links.forEach((link, i) => {
				if (linkEls[i]) {
					linkEls[i].setAttribute('x1', String(link.source.x ?? 0));
					linkEls[i].setAttribute('y1', String(link.source.y ?? 0));
					linkEls[i].setAttribute('x2', String(link.target.x ?? 0));
					linkEls[i].setAttribute('y2', String(link.target.y ?? 0));
				}
			});

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

	// ── Wheel zoom — only when pointer is over the SVG ──
	useEffect(() => {
		const svg = svgRef.current;
		if (!svg) return;

		const handleWheel = (e: WheelEvent) => {
			if (!isPointerOverSvg.current) return;
			e.preventDefault();

			const delta = e.ctrlKey
				? -e.deltaY * 0.01
				: -e.deltaY * ZOOM_SENSITIVITY;

			setZoom((prev) => {
				const next = Math.min(
					MAX_ZOOM,
					Math.max(MIN_ZOOM, prev + delta),
				);

				const rect = svg.getBoundingClientRect();
				const cursorX = e.clientX - rect.left;
				const cursorY = e.clientY - rect.top;
				const svgX = (cursorX - rect.width / 2) / prev;
				const svgY = (cursorY - rect.height / 2) / prev;

				setPanX((px) => px - svgX * (next - prev));
				setPanY((py) => py - svgY * (next - prev));

				return next;
			});
		};

		const handleEnter = () => {
			isPointerOverSvg.current = true;
		};
		const handleLeave = () => {
			isPointerOverSvg.current = false;
		};

		svg.addEventListener('mouseenter', handleEnter);
		svg.addEventListener('mouseleave', handleLeave);
		window.addEventListener('wheel', handleWheel, { passive: false });
		return () => {
			svg.removeEventListener('mouseenter', handleEnter);
			svg.removeEventListener('mouseleave', handleLeave);
			window.removeEventListener('wheel', handleWheel);
		};
	}, []);

	// ── Touch pinch zoom (mobile) ──
	useEffect(() => {
		const svg = svgRef.current;
		if (!svg) return;

		const getTouchDist = (touches: TouchList): number => {
			const dx = touches[0].clientX - touches[1].clientX;
			const dy = touches[0].clientY - touches[1].clientY;
			return Math.hypot(dx, dy);
		};

		const handleTouchStart = (e: TouchEvent) => {
			if (e.touches.length === 2) {
				lastPinchDist.current = getTouchDist(e.touches);
			}
		};

		const handleTouchMove = (e: TouchEvent) => {
			if (e.touches.length === 2 && lastPinchDist.current != null) {
				e.preventDefault();
				const dist = getTouchDist(e.touches);
				const scale = dist / lastPinchDist.current;
				lastPinchDist.current = dist;
				setZoom((prev) =>
					Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev * scale)),
				);
			}
		};

		const handleTouchEnd = () => {
			lastPinchDist.current = null;
		};

		svg.addEventListener('touchstart', handleTouchStart, { passive: true });
		svg.addEventListener('touchmove', handleTouchMove, { passive: false });
		svg.addEventListener('touchend', handleTouchEnd, { passive: true });
		return () => {
			svg.removeEventListener('touchstart', handleTouchStart);
			svg.removeEventListener('touchmove', handleTouchMove);
			svg.removeEventListener('touchend', handleTouchEnd);
		};
	}, []);

	// ── Handlers ──

	const handleNodeClick = useCallback(
		(slug: string) => {
			if (slug !== currentSlug) {
				window.location.href = `/${slug}/`;
			}
		},
		[currentSlug],
	);

	const handleSliderChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			setZoom(parseFloat(e.target.value));
		},
		[],
	);

	const handleResetZoom = useCallback(() => {
		setZoom(1);
		setPanX(0);
		setPanY(0);
	}, []);

	// ── Render states ──

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
		<div ref={containerRef} style={{ position: 'relative' }}>
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
					touchAction: 'none',
					overflow: 'hidden',
				}}>
				{/* Zoomable / pannable group */}
				<g
					transform={`translate(${width / 2 + panX},${height / 2 + panY}) scale(${zoom}) translate(${-width / 2},${-height / 2})`}>
					{/* Links */}
					{links.map((link, i) => (
						<line
							key={`link-${i}`}
							className="sg-link"
							stroke="var(--sl-color-gray-5)"
							strokeWidth={1 / zoom}
							strokeOpacity={0.4}
						/>
					))}

					{/* Nodes */}
					{nodes.map((node) => (
						<g
							key={node.id}
							className="sg-node"
							style={{ cursor: 'pointer' }}
							onClick={() => handleNodeClick(node.id)}
							onMouseEnter={(e) => {
								setHoveredId(node.id);
								showTooltip(node.title, node.id, e);
								openTooltip(`sg-node-${node.id}`);
							}}
							onMouseMove={moveTooltip}
							onMouseLeave={() => {
								setHoveredId(null);
								hideTooltip();
								closeTooltip(`sg-node-${node.id}`);
							}}>
							<circle
								r={node.isCurrent ? 6 : 4}
								fill={
									node.isCurrent
										? 'var(--sl-color-accent)'
										: hoveredId === node.id
											? 'var(--sl-color-accent)'
											: 'var(--sl-color-white)'
								}
								stroke={
									node.isCurrent
										? 'var(--sl-color-accent-high)'
										: hoveredId === node.id
											? 'var(--sl-color-accent-high)'
											: 'var(--sl-color-gray-4)'
								}
								strokeWidth={node.isCurrent ? 2 : 1}
								style={{
									transition: 'fill 0.15s, stroke 0.15s',
								}}
							/>
							<text
								dy={node.isCurrent ? -10 : -8}
								textAnchor="middle"
								fill={
									node.isCurrent
										? 'var(--sl-color-white)'
										: hoveredId === node.id
											? 'var(--sl-color-white)'
											: 'var(--sl-color-gray-3)'
								}
								fontSize={node.isCurrent ? 10 : 8}
								fontWeight={
									node.isCurrent || hoveredId === node.id
										? 600
										: 400
								}
								style={{
									pointerEvents: 'none',
									transition: 'fill 0.15s',
								}}>
								{node.title.length > 20
									? node.title.slice(0, 18) + '...'
									: node.title}
							</text>
						</g>
					))}
				</g>
			</svg>

			{/* Persistent tooltip — single element, content updated via ref */}
			<div
				ref={tooltipRef}
				role="tooltip"
				aria-hidden="true"
				style={{
					position: 'absolute',
					transform: 'translate(-50%, -100%) translateY(-12px)',
					pointerEvents: 'none',
					zIndex: 10,
					background: 'var(--sl-color-gray-6, #1a1a1a)',
					border: '1px solid var(--sl-color-gray-5, #262626)',
					borderRadius: 6,
					padding: '5px 8px',
					whiteSpace: 'nowrap',
					boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
					opacity: 0,
					visibility: 'hidden',
					transition: 'opacity 0.1s ease',
					top: 0,
					left: 0,
				}}>
				<div
					data-sg-tip-title
					style={{
						fontSize: '10px',
						fontWeight: 600,
						color: 'var(--sl-color-white, #e6edf3)',
						lineHeight: 1.3,
					}}
				/>
				<div
					data-sg-tip-path
					style={{
						fontSize: '8.5px',
						color: 'var(--sl-color-gray-3, #8b949e)',
						lineHeight: 1.3,
					}}
				/>
			</div>

			{/* Zoom slider control */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '6px',
					padding: '6px 8px 0',
				}}>
				<button
					onClick={handleResetZoom}
					title="Reset zoom"
					style={{
						background: 'none',
						border: 'none',
						color: 'var(--sl-color-gray-3, #8b949e)',
						fontSize: '10px',
						fontWeight: 600,
						cursor: 'pointer',
						padding: '2px 4px',
						borderRadius: 4,
						lineHeight: 1,
						fontVariantNumeric: 'tabular-nums',
						minWidth: '32px',
						textAlign: 'center',
					}}>
					{Math.round(zoom * 100)}%
				</button>
				<input
					type="range"
					min={MIN_ZOOM}
					max={MAX_ZOOM}
					step={0.05}
					value={zoom}
					onChange={handleSliderChange}
					title={`Zoom: ${Math.round(zoom * 100)}%`}
					style={{
						flex: 1,
						height: '3px',
						appearance: 'none',
						WebkitAppearance: 'none',
						background: `linear-gradient(to right, var(--sl-color-accent, #06b6d4) 0%, var(--sl-color-accent, #06b6d4) ${((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%, var(--sl-color-gray-5, #262626) ${((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%, var(--sl-color-gray-5, #262626) 100%)`,
						borderRadius: '2px',
						cursor: 'pointer',
						outline: 'none',
					}}
				/>
			</div>
		</div>
	);
}
