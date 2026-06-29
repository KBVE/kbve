import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type RefObject,
} from 'react';
import { MIN_ZOOM, MAX_ZOOM, ZOOM_SENSITIVITY } from './graph-core';

export interface PanZoom {
	/** Attach to the `<g>` wrapping all nodes/links. */
	groupRef: RefObject<SVGGElement | null>;
	/** Committed zoom — drives zoom-dependent rendered attrs + the slider. */
	zoom: number;
	/** Live pan/zoom (imperative source of truth, no re-render on change). */
	zoomRef: RefObject<number>;
	panXRef: RefObject<number>;
	panYRef: RefObject<number>;
	/** True while a pointer is over the SVG — gates keyboard shortcuts. */
	isPointerOverSvg: RefObject<boolean>;
	handleSliderChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
	handleResetZoom: () => void;
}

/**
 * Pan + pinch/wheel zoom for the SiteGraph SVG, driven entirely through refs
 * and a single imperative transform writer — high-frequency gestures never
 * re-render the node/link tree. Only `zoom` is committed to state (rAF-
 * throttled) so zoom-dependent attributes (stroke width, label decluttering,
 * the slider) can follow along.
 */
export function usePanZoom(
	svgRef: RefObject<SVGSVGElement | null>,
	width: number,
	height: number,
	ready: boolean,
): PanZoom {
	const [zoom, setZoom] = useState(1);

	const groupRef = useRef<SVGGElement>(null);
	const panXRef = useRef(0);
	const panYRef = useRef(0);
	const zoomRef = useRef(1);
	const zoomCommitRaf = useRef(0);
	const isPointerOverSvg = useRef(false);

	// Active background pointers, keyed by pointerId. 1 → pan, 2 → pinch-zoom.
	const bgPointers = useRef(new Map<number, { x: number; y: number }>());
	const panStart = useRef<{
		startX: number;
		startY: number;
		startPanX: number;
		startPanY: number;
	} | null>(null);
	const pinchStart = useRef<{
		startDist: number;
		startZoom: number;
	} | null>(null);

	const writeTransform = useCallback(() => {
		const g = groupRef.current;
		if (!g) return;
		g.setAttribute(
			'transform',
			`translate(${width / 2 + panXRef.current},${height / 2 + panYRef.current}) scale(${zoomRef.current}) translate(${-width / 2},${-height / 2})`,
		);
	}, [width, height]);

	// Re-apply after any React render so reconciliation can't reset it.
	useLayoutEffect(() => {
		writeTransform();
	});

	const commitZoom = useCallback(() => {
		if (zoomCommitRaf.current) return;
		zoomCommitRaf.current = requestAnimationFrame(() => {
			zoomCommitRaf.current = 0;
			setZoom(zoomRef.current);
		});
	}, []);

	useEffect(
		() => () => {
			if (zoomCommitRaf.current)
				cancelAnimationFrame(zoomCommitRaf.current);
		},
		[],
	);

	// Wheel zoom (anchored at the cursor) + pointer-over tracking.
	useEffect(() => {
		const svg = svgRef.current;
		if (!svg) return;

		const handleWheel = (e: WheelEvent) => {
			if (!isPointerOverSvg.current) return;
			e.preventDefault();

			const delta = e.ctrlKey
				? -e.deltaY * 0.01
				: -e.deltaY * ZOOM_SENSITIVITY;

			const prev = zoomRef.current;
			const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta));

			const rect = svg.getBoundingClientRect();
			const cursorX = e.clientX - rect.left;
			const cursorY = e.clientY - rect.top;
			const svgX = (cursorX - rect.width / 2) / prev;
			const svgY = (cursorY - rect.height / 2) / prev;

			panXRef.current -= svgX * (next - prev);
			panYRef.current -= svgY * (next - prev);
			zoomRef.current = next;
			writeTransform();
			commitZoom();
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
	}, [svgRef, ready, writeTransform, commitZoom]);

	// Unified Pointer Events for background pan + pinch-zoom. One code path for
	// mouse, touch, and pen. 1 active pointer pans, 2 pinch-zoom. Pointers that
	// start inside a node are claimed by the node drag (it stops propagation).
	useEffect(() => {
		const svg = svgRef.current;
		if (!svg) return;

		const pinchDist = (): number => {
			const pts = [...bgPointers.current.values()];
			return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
		};

		const beginPan = (x: number, y: number) => {
			panStart.current = {
				startX: x,
				startY: y,
				startPanX: panXRef.current,
				startPanY: panYRef.current,
			};
		};

		const onDown = (e: PointerEvent) => {
			const target = e.target as Element | null;
			if (target?.closest('.sg-node')) return;
			if (e.pointerType === 'mouse' && e.button !== 0) return;
			try {
				svg.setPointerCapture(e.pointerId);
			} catch {
				// Safari can throw if the element is detaching; ignore.
			}
			bgPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
			if (bgPointers.current.size === 1) {
				beginPan(e.clientX, e.clientY);
				svg.style.cursor = 'grabbing';
			} else if (bgPointers.current.size === 2) {
				panStart.current = null;
				pinchStart.current = {
					startDist: pinchDist(),
					startZoom: zoomRef.current,
				};
			}
		};

		const onMove = (e: PointerEvent) => {
			if (!bgPointers.current.has(e.pointerId)) return;
			bgPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
			if (bgPointers.current.size >= 2 && pinchStart.current) {
				e.preventDefault();
				const scale = pinchDist() / pinchStart.current.startDist;
				const next = Math.min(
					MAX_ZOOM,
					Math.max(MIN_ZOOM, pinchStart.current.startZoom * scale),
				);
				zoomRef.current = next;
				writeTransform();
				commitZoom();
			} else if (panStart.current) {
				const p = panStart.current;
				panXRef.current = p.startPanX + (e.clientX - p.startX);
				panYRef.current = p.startPanY + (e.clientY - p.startY);
				writeTransform();
			}
		};

		const onUp = (e: PointerEvent) => {
			if (!bgPointers.current.has(e.pointerId)) return;
			bgPointers.current.delete(e.pointerId);
			try {
				svg.releasePointerCapture(e.pointerId);
			} catch {
				// Capture may already be gone; ignore.
			}
			if (bgPointers.current.size < 2) pinchStart.current = null;
			if (bgPointers.current.size === 1) {
				const [only] = [...bgPointers.current.values()];
				beginPan(only.x, only.y);
			} else if (bgPointers.current.size === 0) {
				panStart.current = null;
				svg.style.cursor = 'grab';
			}
		};

		svg.addEventListener('pointerdown', onDown);
		svg.addEventListener('pointermove', onMove);
		svg.addEventListener('pointerup', onUp);
		svg.addEventListener('pointercancel', onUp);
		return () => {
			svg.removeEventListener('pointerdown', onDown);
			svg.removeEventListener('pointermove', onMove);
			svg.removeEventListener('pointerup', onUp);
			svg.removeEventListener('pointercancel', onUp);
		};
	}, [svgRef, ready, writeTransform, commitZoom]);

	const handleSliderChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const next = parseFloat(e.target.value);
			zoomRef.current = next;
			writeTransform();
			setZoom(next);
		},
		[writeTransform],
	);

	const handleResetZoom = useCallback(() => {
		zoomRef.current = 1;
		panXRef.current = 0;
		panYRef.current = 0;
		writeTransform();
		setZoom(1);
	}, [writeTransform]);

	return {
		groupRef,
		zoom,
		zoomRef,
		panXRef,
		panYRef,
		isPointerOverSvg,
		handleSliderChange,
		handleResetZoom,
	};
}
