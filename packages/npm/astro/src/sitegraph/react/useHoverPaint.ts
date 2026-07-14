import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import { ZOOM_LABEL_THRESHOLD } from './graph-core';

const HL_FILL = 'var(--sl-color-accent)';
const HL_STROKE = 'var(--sl-color-accent-high)';
const HL_TEXT = 'var(--sl-color-white)';

export interface HoverPaint {
	/** Live hovered node id — never state, so hovering re-renders nothing. */
	hoveredIdRef: RefObject<string | null>;
	/** Paint base + hover overlay onto the cached SVG els. null clears hover. */
	applyHover: (hoverId: string | null) => void;
}

/**
 * Hover-dim without React re-renders. The render writes each node/link's BASE
 * visual into `data-*` attributes; this painter overlays the hover highlight
 * (neighbor emphasis, dimming, label reveal) by mutating those elements
 * directly on mouse-enter/leave — the analog of the imperative pan transform.
 *
 * A `useLayoutEffect` re-applies the current hover after every React render so
 * a base repaint (search/zoom/data change) can't drop the overlay.
 */
export function useHoverPaint(
	svgRef: RefObject<SVGSVGElement | null>,
	adjacency: Map<string, Set<string>>,
	zoomRef: RefObject<number>,
): HoverPaint {
	const hoveredIdRef = useRef<string | null>(null);

	const applyHover = useCallback(
		(hoverId: string | null) => {
			const svg = svgRef.current;
			if (!svg) return;

			// Zoom drives label decluttering imperatively (the render no longer
			// depends on zoom), so reveal every label once zoomed past the
			// threshold even when it isn't part of the static label-base set.
			const zoomReveal = (zoomRef.current ?? 1) >= ZOOM_LABEL_THRESHOLD;

			let set: Set<string> | null = null;
			if (hoverId) {
				set = new Set<string>([hoverId]);
				for (const n of adjacency.get(hoverId) ?? []) set.add(n);
			}

			const nodeEls = svg.querySelectorAll<SVGGElement>('.sg-node');
			for (let i = 0; i < nodeEls.length; i++) {
				const g = nodeEls[i];
				const id = g.dataset.id ?? '';
				const filterPass = g.dataset.filter !== '0';
				const isCurrent = g.dataset.current === '1';
				const labelBase = g.dataset.labelBase === '1';
				const inSet = set ? set.has(id) : true;
				const visible = filterPass && inSet;
				g.style.opacity = visible ? '1' : filterPass ? '0.18' : '0.05';

				const isHovered = hoverId != null && id === hoverId;
				const circle =
					g.querySelector<SVGCircleElement>('.sg-node-circle');
				if (circle) {
					circle.setAttribute(
						'fill',
						isHovered ? HL_FILL : (circle.dataset.fill ?? ''),
					);
					circle.setAttribute(
						'stroke',
						isHovered ? HL_STROKE : (circle.dataset.stroke ?? ''),
					);
				}
				const text = g.querySelector<SVGTextElement>('.sg-node-label');
				if (text) {
					text.setAttribute(
						'fill',
						isHovered ? HL_TEXT : (text.dataset.fill ?? ''),
					);
					text.setAttribute(
						'opacity',
						labelBase || isHovered || zoomReveal ? '1' : '0',
					);
					text.style.fontWeight =
						isCurrent || isHovered ? '600' : '400';
				}
			}

			const linkEls = svg.querySelectorAll<SVGPathElement>('.sg-link');
			for (let i = 0; i < linkEls.length; i++) {
				const p = linkEls[i];
				const baseOp = p.dataset.rel === '1' ? 0.6 : 0.4;
				let op = baseOp;
				if (set) {
					const s = p.dataset.source ?? '';
					const t = p.dataset.target ?? '';
					op = set.has(s) && set.has(t) ? baseOp : 0.08;
				}
				p.setAttribute('stroke-opacity', String(op));
			}
		},
		[svgRef, adjacency, zoomRef],
	);

	// Re-apply hover after every render so a base repaint can't drop the overlay.
	useLayoutEffect(() => {
		applyHover(hoveredIdRef.current);
	});

	return { hoveredIdRef, applyHover };
}
