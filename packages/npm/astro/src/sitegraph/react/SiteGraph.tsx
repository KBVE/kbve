import {
	useEffect,
	useRef,
	useState,
	useCallback,
	useMemo,
	type CSSProperties,
} from 'react';
import {
	forceSimulation,
	forceLink,
	forceManyBody,
	forceCenter,
	forceCollide,
	forceX,
	forceY,
	type Simulation,
	type SimulationNodeDatum,
	type SimulationLinkDatum,
} from 'd3-force';
import { openTooltip, closeTooltip } from '@kbve/droid';
import { fetchSiteGraph } from './cache';
import type { SiteGraphData } from '../types';

interface GraphNode extends SimulationNodeDatum {
	id: string;
	title: string;
	isCurrent: boolean;
	tag: string | null;
	degree: number;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
	source: GraphNode;
	target: GraphNode;
	relationship?: string;
}

export interface SiteGraphProps {
	currentSlug: string;
	depth?: number;
	width?: number;
	height?: number;
	endpoint?: string;
	/**
	 * Maps relationship key (from `node.edges`) to stroke color. Lets each
	 * consuming site theme its own taxonomy without forking the component.
	 */
	edgeColors?: Record<string, string>;
	/**
	 * Returns a domain-specific tag for a slug. Used to style nodes (color,
	 * radius) + cluster nodes by tag in the simulation.
	 */
	tagOf?: (slug: string) => string | null;
	/**
	 * Maps a tag returned by `tagOf` to fill/stroke colors + radius. Falls
	 * back to default theming when missing.
	 */
	tagStyles?: Record<
		string,
		{ fill: string; stroke: string; radius: number }
	>;
	/** Fixed-size mode (no ResizeObserver). Defaults to `false` (responsive). */
	fixedSize?: boolean;
	/** Min/max depth allowed in the depth selector. Defaults to 1..3. */
	minDepth?: number;
	maxDepth?: number;
	/** Hide the inline controls bar (depth, search, fullscreen). */
	hideControls?: boolean;
	/** Render in fullscreen-modal mode. Internal — passed by FullscreenSiteGraph. */
	isFullscreen?: boolean;
	/** Notifies the host when the user toggles fullscreen. */
	onFullscreenChange?: (next: boolean) => void;
}

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
const ZOOM_SENSITIVITY = 0.002;

/** d3-force tick budget — caps long-running simulations on dense neighborhoods. */
const ALPHA_MIN = 0.05;
const ALPHA_DECAY = 0.05;

/** localStorage key for the user's preferred neighborhood depth. */
const DEPTH_STORAGE_KEY = 'kbve-sitegraph-depth';

/** Reads the user's reduced-motion preference. SSR-safe. */
function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined') return false;
	return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Reads + writes the depth selection to localStorage. */
function loadStoredDepth(fallback: number, min: number, max: number): number {
	if (typeof localStorage === 'undefined') return fallback;
	const raw = localStorage.getItem(DEPTH_STORAGE_KEY);
	if (!raw) return fallback;
	const n = Number(raw);
	return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

function persistDepth(depth: number): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(DEPTH_STORAGE_KEY, String(depth));
	} catch {
		// quota / disabled — ignore
	}
}

/** Reads sg-prefixed query params for shareable graph state. */
function readUrlState(): { depth: number | null; q: string | null } {
	if (typeof window === 'undefined') return { depth: null, q: null };
	const params = new URLSearchParams(window.location.search);
	const depthRaw = params.get('sg-depth');
	const depth = depthRaw ? Number(depthRaw) : null;
	return {
		depth: depth !== null && Number.isFinite(depth) ? depth : null,
		q: params.get('sg-q'),
	};
}

function writeUrlState(state: { depth: number; q: string }): void {
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

function getNeighborhood(
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
function radiusForDegree(degree: number, base: number): number {
	const extra = Math.min(6, Math.sqrt(Math.max(degree - 1, 0)) * 1.2);
	return base + extra;
}

/**
 * Builds the neighbor lookup used for hover-dim. Lets us fade everything
 * except the hovered node + its immediate neighbors without re-running
 * BFS on every mouse-enter.
 */
function buildAdjacency(links: GraphLink[]): Map<string, Set<string>> {
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

export function SiteGraph({
	currentSlug,
	depth: depthProp = 2,
	width: widthProp = 280,
	height: heightProp = 280,
	endpoint,
	edgeColors,
	tagOf = () => null,
	tagStyles,
	fixedSize = false,
	minDepth = 1,
	maxDepth = 3,
	hideControls = false,
	isFullscreen = false,
	onFullscreenChange,
}: SiteGraphProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const tooltipRef = useRef<HTMLDivElement>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const [graphData, setGraphData] = useState<SiteGraphData | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [retryNonce, setRetryNonce] = useState(0);
	const simulationRef = useRef<Simulation<GraphNode, GraphLink> | null>(null);

	const [hoveredId, setHoveredId] = useState<string | null>(null);
	const [pinnedId, setPinnedId] = useState<string | null>(null);
	// Depth seeds from (in order): URL `sg-depth` → localStorage → prop default.
	const [depth, setDepth] = useState(() => {
		const urlDepth = readUrlState().depth;
		if (urlDepth !== null && urlDepth >= minDepth && urlDepth <= maxDepth) {
			return urlDepth;
		}
		return loadStoredDepth(depthProp, minDepth, maxDepth);
	});
	const [search, setSearch] = useState(() => readUrlState().q ?? '');
	const reducedMotion = useMemo(prefersReducedMotion, []);

	// Responsive sizing — ResizeObserver on the container.
	const [size, setSize] = useState({ width: widthProp, height: heightProp });
	useEffect(() => {
		if (fixedSize) {
			setSize({ width: widthProp, height: heightProp });
			return;
		}
		const el = containerRef.current;
		if (!el || typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const cw = Math.round(entry.contentRect.width);
				if (cw > 0) {
					setSize({
						width: cw,
						height: isFullscreen
							? Math.round(entry.contentRect.height)
							: heightProp,
					});
				}
			}
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, [fixedSize, widthProp, heightProp, isFullscreen]);

	const width = size.width;
	const height = size.height;

	const [zoom, setZoom] = useState(1);
	const [panX, setPanX] = useState(0);
	const [panY, setPanY] = useState(0);

	const isPointerOverSvg = useRef(false);
	const lastPinchDist = useRef<number | null>(null);

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

	// Persist depth to localStorage and reflect depth + search in the URL so
	// users can share/refresh into the same view.
	useEffect(() => {
		persistDepth(depth);
		writeUrlState({ depth, q: search });
	}, [depth, search]);

	// Memoize neighborhood so adjacency + render don't recompute every keystroke.
	const { nodes, links, adjacency } = useMemo(() => {
		if (!graphData)
			return {
				nodes: [],
				links: [],
				adjacency: new Map<string, Set<string>>(),
			};
		const result = getNeighborhood(graphData, currentSlug, depth, tagOf);
		return {
			...result,
			adjacency: buildAdjacency(result.links),
		};
	}, [graphData, currentSlug, depth, tagOf]);

	useEffect(() => {
		if (!graphData || !svgRef.current || nodes.length === 0) return;

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
	}, [graphData, nodes, links, width, height, reducedMotion]);

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

	// Click-drag pan on empty SVG space. Clicks that originate inside an
	// `.sg-node` group are ignored — those are claimed by node-drag below.
	useEffect(() => {
		const svg = svgRef.current;
		if (!svg) return;

		let dragging = false;
		let startX = 0;
		let startY = 0;
		let startPanX = 0;
		let startPanY = 0;

		const onDown = (e: MouseEvent) => {
			if (e.button !== 0) return;
			const target = e.target as SVGElement | null;
			if (target?.closest('.sg-node')) return;
			dragging = true;
			startX = e.clientX;
			startY = e.clientY;
			startPanX = panX;
			startPanY = panY;
			svg.style.cursor = 'grabbing';
		};
		const onMove = (e: MouseEvent) => {
			if (!dragging) return;
			setPanX(startPanX + (e.clientX - startX));
			setPanY(startPanY + (e.clientY - startY));
		};
		const onUp = () => {
			if (!dragging) return;
			dragging = false;
			svg.style.cursor = 'grab';
		};

		svg.addEventListener('mousedown', onDown);
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
		return () => {
			svg.removeEventListener('mousedown', onDown);
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
		};
	}, [panX, panY]);

	// Node drag — pin the node's simulation position while dragging by
	// setting fx/fy, and release with `simulation.alphaTarget` ramping back
	// down so the rest of the graph re-settles.
	const dragNode = useCallback(
		(node: GraphNode) => (e: React.MouseEvent) => {
			e.stopPropagation();
			const sim = simulationRef.current;
			const svg = svgRef.current;
			if (!sim || !svg) return;

			const rect = svg.getBoundingClientRect();
			const toSvg = (clientX: number, clientY: number) => {
				const relX = clientX - rect.left - rect.width / 2 - panX;
				const relY = clientY - rect.top - rect.height / 2 - panY;
				return {
					x: relX / zoom + width / 2,
					y: relY / zoom + height / 2,
				};
			};

			node.fx = node.x;
			node.fy = node.y;
			sim.alphaTarget(0.3).restart();

			const onMove = (ev: MouseEvent) => {
				const p = toSvg(ev.clientX, ev.clientY);
				node.fx = p.x;
				node.fy = p.y;
			};
			const onUp = () => {
				node.fx = null;
				node.fy = null;
				sim.alphaTarget(0);
				window.removeEventListener('mousemove', onMove);
				window.removeEventListener('mouseup', onUp);
			};
			window.addEventListener('mousemove', onMove);
			window.addEventListener('mouseup', onUp);
		},
		[panX, panY, zoom, width, height],
	);

	const handleNodeClick = useCallback(
		(slug: string, e: React.MouseEvent) => {
			if (slug === currentSlug) return;
			const url = `/${slug}/`;
			// Match anchor-tag conventions: ctrl/meta/middle-click → new tab.
			if (e.ctrlKey || e.metaKey || e.button === 1) {
				window.open(url, '_blank', 'noopener');
				return;
			}
			window.location.href = url;
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

	// Keyboard shortcuts (only fire when the pointer is over the graph or it's
	// in fullscreen, so we don't hijack typing in unrelated parts of the page).
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			const inText =
				e.target instanceof HTMLElement &&
				(e.target.tagName === 'INPUT' ||
					e.target.tagName === 'TEXTAREA' ||
					e.target.isContentEditable);
			if (!isFullscreen && !isPointerOverSvg.current && !inText) return;

			if (e.key === '/' && !inText) {
				e.preventDefault();
				searchInputRef.current?.focus();
				searchInputRef.current?.select();
				return;
			}
			if (e.key === 'f' && !inText && onFullscreenChange) {
				e.preventDefault();
				onFullscreenChange(!isFullscreen);
				return;
			}
			if (e.key === 'Escape') {
				if (search) {
					setSearch('');
					return;
				}
				if (pinnedId) {
					setPinnedId(null);
					setHoveredId(null);
					hideTooltip();
					return;
				}
				if (isFullscreen && onFullscreenChange) {
					onFullscreenChange(false);
				}
			}
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, [isFullscreen, onFullscreenChange, search, pinnedId, hideTooltip]);

	// Background tap on the SVG dismisses any pinned tooltip (touch only).
	useEffect(() => {
		const svg = svgRef.current;
		if (!svg) return;
		const onTouch = (e: TouchEvent) => {
			const target = e.target as SVGElement | null;
			if (target?.closest('.sg-node')) return;
			setPinnedId(null);
			setHoveredId(null);
			hideTooltip();
		};
		svg.addEventListener('touchstart', onTouch, { passive: true });
		return () => svg.removeEventListener('touchstart', onTouch);
	}, [hideTooltip]);

	if (error) {
		return (
			<div
				className="sg-error"
				role="alert"
				style={{
					padding: '8px',
					fontSize: '12px',
					color: 'var(--sl-color-gray-4)',
					display: 'flex',
					alignItems: 'center',
					gap: '8px',
				}}>
				<span>Graph unavailable</span>
				<button
					onClick={() => setRetryNonce((n) => n + 1)}
					style={{
						background: 'var(--sl-color-bg-nav)',
						color: 'inherit',
						border: '1px solid var(--sl-color-gray-5, #262626)',
						borderRadius: 4,
						padding: '2px 8px',
						fontSize: '11px',
						cursor: 'pointer',
					}}>
					Retry
				</button>
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

	const styleFor = (node: GraphNode) => {
		if (node.tag && tagStyles?.[node.tag]) return tagStyles[node.tag];
		return null;
	};

	const matchesSearch = (node: GraphNode): boolean => {
		if (!search) return true;
		const q = search.toLowerCase();
		return (
			node.title.toLowerCase().includes(q) ||
			node.id.toLowerCase().includes(q)
		);
	};

	// Hover-dim adjacency: nodes/links touching the hovered node stay full
	// opacity; everything else fades. Search-filter dimming layers on top.
	const isAdjacent = (id: string): boolean => {
		if (!hoveredId) return true;
		if (id === hoveredId) return true;
		return adjacency.get(hoveredId)?.has(id) ?? false;
	};

	const containerStyle: CSSProperties = isFullscreen
		? {
				position: 'fixed',
				inset: 0,
				zIndex: 1000,
				background: 'var(--sl-color-bg, #0d1117)',
				padding: '16px',
				display: 'flex',
				flexDirection: 'column',
			}
		: { position: 'relative' };

	return (
		<div ref={containerRef} style={containerStyle}>
			{!hideControls && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '6px',
						padding: '0 8px 6px',
						fontSize: '11px',
						color: 'var(--sl-color-gray-3, #8b949e)',
					}}>
					<label
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: '4px',
						}}>
						Depth
						<select
							value={depth}
							onChange={(e) => setDepth(Number(e.target.value))}
							style={{
								background: 'var(--sl-color-bg-nav)',
								color: 'inherit',
								border: '1px solid var(--sl-color-gray-5, #262626)',
								borderRadius: 4,
								padding: '1px 4px',
								fontSize: '11px',
							}}>
							{Array.from(
								{ length: maxDepth - minDepth + 1 },
								(_, i) => minDepth + i,
							).map((d) => (
								<option key={d} value={d}>
									{d}
								</option>
							))}
						</select>
					</label>
					<input
						ref={searchInputRef}
						type="search"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Filter…  (/)"
						aria-label="Filter nodes by title (press / to focus)"
						style={{
							flex: 1,
							minWidth: 0,
							background: 'var(--sl-color-bg-nav)',
							color: 'inherit',
							border: '1px solid var(--sl-color-gray-5, #262626)',
							borderRadius: 4,
							padding: '2px 6px',
							fontSize: '11px',
						}}
					/>
					{onFullscreenChange && (
						<button
							onClick={() => onFullscreenChange(!isFullscreen)}
							title={
								isFullscreen ? 'Exit fullscreen' : 'Fullscreen'
							}
							aria-label={
								isFullscreen ? 'Exit fullscreen' : 'Fullscreen'
							}
							style={{
								background: 'none',
								border: '1px solid var(--sl-color-gray-5, #262626)',
								color: 'inherit',
								borderRadius: 4,
								padding: '1px 6px',
								fontSize: '11px',
								cursor: 'pointer',
							}}>
							{isFullscreen ? '×' : '⤢'}
						</button>
					)}
				</div>
			)}
			<svg
				ref={svgRef}
				width={width}
				height={height}
				viewBox={`0 0 ${width} ${height}`}
				style={{
					width: '100%',
					height: isFullscreen ? '100%' : `${height}px`,
					flex: isFullscreen ? 1 : undefined,
					background: 'var(--sl-color-bg-nav)',
					borderRadius: '8px',
					cursor: 'grab',
					touchAction: 'none',
					overflow: 'hidden',
				}}>
				<g
					transform={`translate(${width / 2 + panX},${height / 2 + panY}) scale(${zoom}) translate(${-width / 2},${-height / 2})`}>
					{links.map((l, i) => {
						const adj =
							isAdjacent(l.source.id) && isAdjacent(l.target.id);
						const opacity = adj
							? l.relationship
								? 0.6
								: 0.4
							: 0.08;
						return (
							<line
								key={`link-${i}`}
								className="sg-link"
								stroke={
									l.relationship
										? edgeColors?.[l.relationship] ||
											'var(--sl-color-gray-4)'
										: 'var(--sl-color-gray-5)'
								}
								strokeWidth={
									l.relationship ? 1.5 / zoom : 1 / zoom
								}
								strokeOpacity={opacity}
								style={{ transition: 'stroke-opacity 0.12s' }}
							/>
						);
					})}

					{nodes.map((node) => {
						const tagStyle = styleFor(node);
						const baseRadius = node.isCurrent
							? 6
							: (tagStyle?.radius ?? 4);
						const radius = node.isCurrent
							? baseRadius
							: radiusForDegree(node.degree, baseRadius);
						const fill = node.isCurrent
							? 'var(--sl-color-accent)'
							: hoveredId === node.id
								? 'var(--sl-color-accent)'
								: (tagStyle?.fill ?? 'var(--sl-color-white)');
						const stroke = node.isCurrent
							? 'var(--sl-color-accent-high)'
							: hoveredId === node.id
								? 'var(--sl-color-accent-high)'
								: (tagStyle?.stroke ??
									'var(--sl-color-gray-4)');

						const filterPass = matchesSearch(node);
						const adjPass = isAdjacent(node.id);
						const visible = filterPass && adjPass;
						const opacity = visible ? 1 : filterPass ? 0.18 : 0.05;

						return (
							<g
								key={node.id}
								className="sg-node"
								style={{
									cursor: 'pointer',
									opacity,
									transition: 'opacity 0.12s',
								}}
								onClick={(e) => handleNodeClick(node.id, e)}
								onMouseDown={dragNode(node)}
								onMouseEnter={(e) => {
									setHoveredId(node.id);
									showTooltip(node.title, node.id, e);
									openTooltip(`sg-node-${node.id}`);
								}}
								onMouseMove={moveTooltip}
								onMouseLeave={() => {
									if (pinnedId === node.id) return;
									setHoveredId(null);
									hideTooltip();
									closeTooltip(`sg-node-${node.id}`);
								}}
								onTouchStart={(e) => {
									setPinnedId(node.id);
									setHoveredId(node.id);
									const touch = e.touches[0];
									if (!touch) return;
									showTooltip(node.title, node.id, {
										clientX: touch.clientX,
										clientY: touch.clientY,
									} as React.MouseEvent);
								}}>
								<circle
									r={radius}
									fill={fill}
									stroke={stroke}
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
						);
					})}
				</g>
			</svg>

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

export default SiteGraph;
