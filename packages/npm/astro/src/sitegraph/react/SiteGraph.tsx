import {
	useEffect,
	useRef,
	useState,
	useCallback,
	useMemo,
	useDeferredValue,
	type CSSProperties,
} from 'react';
import { openTooltip, closeTooltip } from '@kbve/droid';
import {
	type GraphNode,
	prefersReducedMotion,
	loadStoredDepth,
	persistDepth,
	readUrlState,
	writeUrlState,
	radiusForDegree,
} from './graph-core';
import { usePanZoom } from './usePanZoom';
import { useGraphSimulation } from './useGraphSimulation';
import { useNeighborhood } from './useNeighborhood';
import { useHoverPaint } from './useHoverPaint';
import { GraphControls } from './GraphControls';
import { GraphLegend } from './GraphLegend';
import { GraphTooltip } from './GraphTooltip';
import { GraphZoomBar } from './GraphZoomBar';

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
	/**
	 * Optional SVG `stroke-dasharray` keyed by relationship. Layered on top
	 * of `edgeColors` so color-blind users have a redundant signal for
	 * relationship type. Example: `{ downgrade: '4 2', upgrade: '0' }`.
	 */
	edgeDashes?: Record<string, string>;
	/**
	 * Human-readable labels for relationships, used in the cluster legend
	 * + tooltips. Falls back to the relationship key itself.
	 */
	edgeLabels?: Record<string, string>;
	/**
	 * Pretty labels for tags in the cluster legend. Falls back to the tag
	 * key itself.
	 */
	tagLabels?: Record<string, string>;
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

export function SiteGraph({
	currentSlug,
	depth: depthProp = 2,
	width: widthProp = 280,
	height: heightProp = 280,
	endpoint,
	edgeColors,
	edgeDashes,
	edgeLabels,
	tagOf = () => null,
	tagStyles,
	tagLabels,
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
	// Keep the input responsive while the expensive per-node filter/label
	// recompute (and on big graphs, the reconcile of every node) lags a frame
	// behind keystrokes instead of blocking them.
	const deferredSearch = useDeferredValue(search);
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

	// Graph fetch + memoized neighborhood/adjacency/distinct sets for the
	// current slug + depth. Recomputes only on data/slug/depth change.
	const {
		graphData,
		error,
		retry,
		nodes,
		links,
		adjacency,
		distinctTags,
		distinctRelationships,
	} = useNeighborhood(currentSlug, depth, tagOf, endpoint);

	// The SVG only renders once there's a neighborhood (loading/empty/error
	// states return earlier), so gesture listeners must (re)attach when this
	// flips true — otherwise they bind to a not-yet-mounted svg and never fire.
	const graphReady = nodes.length > 0;

	// Pan + pinch/wheel zoom, driven through refs + an imperative transform
	// writer so gestures never re-render the node/link tree. Zoom is broadcast
	// via `subscribeZoom` (no React state) so only the zoom bar + imperative
	// label-reveal follow it — the node/link tree never reconciles on zoom.
	const {
		groupRef,
		zoomRef,
		panXRef,
		panYRef,
		isPointerOverSvg,
		subscribeZoom,
		handleSliderChange,
		handleResetZoom,
	} = usePanZoom(svgRef, width, height, graphReady);

	// Set true once a node pointer-drag passes the move threshold, so the
	// trailing click doesn't navigate.
	const draggedRef = useRef(false);

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

	// Hover-dim painted imperatively from the base styling the render writes to
	// `data-*` attrs — hovering a node re-renders nothing. The painter also owns
	// zoom-driven label decluttering (reads `zoomRef`).
	const { hoveredIdRef, applyHover } = useHoverPaint(
		svgRef,
		adjacency,
		zoomRef,
	);

	// Zoom no longer lives in React state, so repaint labels imperatively when
	// the committed zoom crosses the reveal threshold during a gesture.
	useEffect(
		() => subscribeZoom(() => applyHover(hoveredIdRef.current)),
		[subscribeZoom, applyHover, hoveredIdRef],
	);

	// Persist depth to localStorage and reflect depth + search in the URL so
	// users can share/refresh into the same view.
	useEffect(() => {
		persistDepth(depth);
		writeUrlState({ depth, q: search });
	}, [depth, search]);

	// d3-force layout — ticks straight to the DOM, gated on visibility +
	// on-screen, hard-stopped on SPA swap. Returns the live sim for dragging.
	const simulationRef = useGraphSimulation(
		svgRef,
		containerRef,
		!!graphData,
		nodes,
		links,
		width,
		height,
		reducedMotion,
	);

	// Node drag — pin the node's simulation position while dragging by
	// setting fx/fy, and release with `simulation.alphaTarget` ramping back
	// down so the rest of the graph re-settles.
	const dragNode = useCallback(
		(node: GraphNode) => (e: React.PointerEvent) => {
			e.stopPropagation();
			if (e.pointerType === 'mouse' && e.button !== 0) return;
			const sim = simulationRef.current;
			const svg = svgRef.current;
			if (!sim || !svg) return;

			const el = e.currentTarget as SVGGElement;
			try {
				el.setPointerCapture(e.pointerId);
			} catch {
				// Safari may throw mid-teardown; the drag still works without it.
			}

			const rect = svg.getBoundingClientRect();
			const toSvg = (clientX: number, clientY: number) => {
				const relX =
					clientX - rect.left - rect.width / 2 - panXRef.current;
				const relY =
					clientY - rect.top - rect.height / 2 - panYRef.current;
				return {
					x: relX / zoomRef.current + width / 2,
					y: relY / zoomRef.current + height / 2,
				};
			};

			const downX = e.clientX;
			const downY = e.clientY;
			draggedRef.current = false;

			node.fx = node.x;
			node.fy = node.y;
			sim.alphaTarget(0.3).restart();

			const onMove = (ev: PointerEvent) => {
				if (
					!draggedRef.current &&
					Math.hypot(ev.clientX - downX, ev.clientY - downY) > 4
				) {
					draggedRef.current = true;
				}
				const p = toSvg(ev.clientX, ev.clientY);
				node.fx = p.x;
				node.fy = p.y;
			};
			const onUp = (ev: PointerEvent) => {
				node.fx = null;
				node.fy = null;
				sim.alphaTarget(0);
				try {
					el.releasePointerCapture(ev.pointerId);
				} catch {
					// Capture may already be released; ignore.
				}
				el.removeEventListener('pointermove', onMove);
				el.removeEventListener('pointerup', onUp);
				el.removeEventListener('pointercancel', onUp);
			};
			el.addEventListener('pointermove', onMove);
			el.addEventListener('pointerup', onUp);
			el.addEventListener('pointercancel', onUp);
		},
		[width, height],
	);

	const handleNodeClick = useCallback(
		(slug: string, e: React.MouseEvent) => {
			// Suppress the navigation that a drag's trailing click would
			// otherwise trigger.
			if (draggedRef.current) {
				draggedRef.current = false;
				return;
			}
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
					hoveredIdRef.current = null;
					applyHover(null);
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
	}, [
		isFullscreen,
		onFullscreenChange,
		search,
		pinnedId,
		hideTooltip,
		applyHover,
		hoveredIdRef,
	]);

	// Background tap on the SVG dismisses any pinned tooltip (touch only).
	useEffect(() => {
		const svg = svgRef.current;
		if (!svg) return;
		const onTouch = (e: TouchEvent) => {
			const target = e.target as SVGElement | null;
			if (target?.closest('.sg-node')) return;
			setPinnedId(null);
			hoveredIdRef.current = null;
			applyHover(null);
			hideTooltip();
		};
		svg.addEventListener('touchstart', onTouch, { passive: true });
		return () => svg.removeEventListener('touchstart', onTouch);
	}, [hideTooltip, applyHover, hoveredIdRef]);

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
					flexWrap: 'wrap',
				}}>
				<span>Graph unavailable</span>
				<code
					title={error}
					style={{
						fontSize: '10px',
						color: 'var(--sl-color-gray-3)',
						maxWidth: '200px',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}>
					{error}
				</code>
				<button
					onClick={retry}
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
		if (!deferredSearch) return true;
		const q = deferredSearch.toLowerCase();
		return (
			node.title.toLowerCase().includes(q) ||
			node.id.toLowerCase().includes(q)
		);
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
				<GraphControls
					depth={depth}
					onDepthChange={setDepth}
					minDepth={minDepth}
					maxDepth={maxDepth}
					search={search}
					onSearchChange={setSearch}
					searchInputRef={searchInputRef}
					isFullscreen={isFullscreen}
					onFullscreenChange={onFullscreenChange}
				/>
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
				<g ref={groupRef}>
					{links.map((l, i) => {
						// Base stroke-opacity (no hover); the hover overlay
						// dims non-incident edges imperatively via `data-*`.
						const opacity = l.relationship ? 0.6 : 0.4;
						const dash = l.relationship
							? edgeDashes?.[l.relationship]
							: undefined;
						return (
							<path
								key={`link-${i}`}
								className="sg-link"
								data-rel={l.relationship ? '1' : '0'}
								data-source={l.source.id}
								data-target={l.target.id}
								fill="none"
								stroke={
									l.relationship
										? edgeColors?.[l.relationship] ||
											'var(--sl-color-gray-4)'
										: 'var(--sl-color-gray-5)'
								}
								strokeWidth={l.relationship ? 1.5 : 1}
								vectorEffect="non-scaling-stroke"
								strokeOpacity={opacity}
								strokeDasharray={dash}
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
						// Base (no-hover) visuals. The hover overlay swaps these
						// imperatively via the `data-*` attrs below — see
						// useHoverPaint — so hovering re-renders nothing.
						const baseFill = node.isCurrent
							? 'var(--sl-color-accent)'
							: (tagStyle?.fill ?? 'var(--sl-color-white)');
						const baseStroke = node.isCurrent
							? 'var(--sl-color-accent-high)'
							: (tagStyle?.stroke ?? 'var(--sl-color-gray-4)');
						const baseTextFill = node.isCurrent
							? 'var(--sl-color-white)'
							: 'var(--sl-color-gray-3)';

						const filterPass = matchesSearch(node);
						const opacity = filterPass ? 1 : 0.05;

						// Static label-visibility base: current node, search
						// matches, and degree-≥5 hubs always show. The zoom
						// threshold + hovered-node reveals are layered on
						// imperatively (useHoverPaint) so zoom never re-renders.
						const labelBase =
							node.isCurrent ||
							(!!deferredSearch && filterPass) ||
							node.degree >= 5;

						return (
							<g
								key={node.id}
								className="sg-node"
								data-id={node.id}
								data-current={node.isCurrent ? '1' : '0'}
								data-filter={filterPass ? '1' : '0'}
								data-label-base={labelBase ? '1' : '0'}
								style={{
									cursor: 'pointer',
									opacity,
									transition: 'opacity 0.12s',
								}}
								onClick={(e) => handleNodeClick(node.id, e)}
								onPointerDown={dragNode(node)}
								onMouseEnter={(e) => {
									hoveredIdRef.current = node.id;
									applyHover(node.id);
									showTooltip(node.title, node.id, e);
									openTooltip(`sg-node-${node.id}`);
								}}
								onMouseMove={moveTooltip}
								onMouseLeave={() => {
									if (pinnedId === node.id) return;
									hoveredIdRef.current = null;
									applyHover(null);
									hideTooltip();
									closeTooltip(`sg-node-${node.id}`);
								}}
								onTouchStart={(e) => {
									setPinnedId(node.id);
									hoveredIdRef.current = node.id;
									applyHover(node.id);
									const touch = e.touches[0];
									if (!touch) return;
									showTooltip(node.title, node.id, {
										clientX: touch.clientX,
										clientY: touch.clientY,
									} as React.MouseEvent);
								}}>
								<circle
									className="sg-node-circle"
									data-fill={baseFill}
									data-stroke={baseStroke}
									r={radius}
									fill={baseFill}
									stroke={baseStroke}
									strokeWidth={node.isCurrent ? 2 : 1}
									vectorEffect="non-scaling-stroke"
									style={{
										transition: 'fill 0.15s, stroke 0.15s',
									}}
								/>
								<text
									className="sg-node-label"
									data-fill={baseTextFill}
									dy={node.isCurrent ? -10 : -8}
									textAnchor="middle"
									fill={baseTextFill}
									fontSize={node.isCurrent ? 10 : 8}
									fontWeight={node.isCurrent ? 600 : 400}
									opacity={labelBase ? 1 : 0}
									style={{
										pointerEvents: 'none',
										transition: 'fill 0.15s, opacity 0.15s',
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

			<GraphLegend
				distinctTags={distinctTags}
				distinctRelationships={distinctRelationships}
				tagStyles={tagStyles}
				tagLabels={tagLabels}
				edgeColors={edgeColors}
				edgeDashes={edgeDashes}
				edgeLabels={edgeLabels}
			/>

			<GraphTooltip tooltipRef={tooltipRef} />

			<GraphZoomBar
				zoomRef={zoomRef}
				subscribeZoom={subscribeZoom}
				onReset={handleResetZoom}
				onSliderChange={handleSliderChange}
			/>
		</div>
	);
}

export default SiteGraph;
