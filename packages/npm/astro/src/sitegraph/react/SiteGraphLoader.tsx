import { useEffect, useState, lazy, Suspense } from 'react';
import { DroidEvents } from '@kbve/droid';
import type { SiteGraphProps } from './SiteGraph';

const SiteGraph = lazy(() => import('./SiteGraph'));
const Backlinks = lazy(() => import('./Backlinks'));

export interface SiteGraphLoaderProps extends Omit<
	SiteGraphProps,
	'currentSlug'
> {
	currentSlug: string;
	/** DOM data attribute the loader inspects on mount to detect initial open state. */
	collapsedAttribute?: string;
	/** Panel id on the droid event bus; defaults to `'right'`. */
	panelId?: string;
	/**
	 * Min viewport width (px) at which the graph mounts. Below this the
	 * loader renders nothing — the right sidebar isn't available on mobile,
	 * so the graph would sit orphaned. Defaults to 1024.
	 */
	mobileBreakpoint?: number;
}

function useViewportAtLeast(minPx: number): boolean {
	const [matches, setMatches] = useState(() => {
		if (typeof window === 'undefined') return true;
		return window.matchMedia(`(min-width: ${minPx}px)`).matches;
	});
	useEffect(() => {
		if (typeof window === 'undefined') return;
		const mql = window.matchMedia(`(min-width: ${minPx}px)`);
		const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
		mql.addEventListener('change', handler);
		setMatches(mql.matches);
		return () => mql.removeEventListener('change', handler);
	}, [minPx]);
	return matches;
}

/**
 * Lazy-mounts SiteGraph + Backlinks on droid `panel-open` for the right
 * sidebar. Skips downloading the d3-force chunk until the user actually
 * opens the panel; once mounted, stays in the DOM (hidden) so re-opens
 * don't refetch the graph.
 *
 * Manages a fullscreen-modal toggle: clicking the expand button in the
 * inline graph swaps in a full-viewport overlay; ESC or the close
 * control returns to the inline view.
 */
export function SiteGraphLoader({
	currentSlug,
	collapsedAttribute = 'data-right-sidebar-collapsed',
	panelId = 'right',
	mobileBreakpoint = 1024,
	...graphProps
}: SiteGraphLoaderProps) {
	const [visible, setVisible] = useState(false);
	const [hasLoaded, setHasLoaded] = useState(false);
	const [fullscreen, setFullscreen] = useState(false);

	const wideEnough = useViewportAtLeast(mobileBreakpoint);

	useEffect(() => {
		if (!wideEnough) return;
		const isOpen =
			document.documentElement.getAttribute(collapsedAttribute) !==
			'true';
		if (isOpen) {
			setVisible(true);
			setHasLoaded(true);
		}

		const handleOpen = (payload: any) => {
			if (payload?.id === panelId) {
				setVisible(true);
				setHasLoaded(true);
			}
		};
		const handleClose = (payload: any) => {
			if (payload?.id === panelId) setVisible(false);
		};

		DroidEvents.on('panel-open', handleOpen);
		DroidEvents.on('panel-close', handleClose);

		return () => {
			DroidEvents.off('panel-open', handleOpen);
			DroidEvents.off('panel-close', handleClose);
		};
	}, [collapsedAttribute, panelId, wideEnough]);

	useEffect(() => {
		if (!fullscreen) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setFullscreen(false);
		};
		window.addEventListener('keydown', onKey);
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			window.removeEventListener('keydown', onKey);
			document.body.style.overflow = prev;
		};
	}, [fullscreen]);

	if (!wideEnough) return null;
	if (!hasLoaded) return null;

	const fallback = (
		<div
			style={{
				minHeight: '320px',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
			}}>
			<div className="sg-spinner" aria-hidden="true" />
		</div>
	);

	return (
		<>
			<div
				className="sg-container"
				style={{
					display: visible ? 'block' : 'none',
					padding: '8px 0',
				}}>
				<Suspense fallback={fallback}>
					<div style={{ marginBottom: '12px' }}>
						<h3
							style={{
								fontSize: '12px',
								fontWeight: 600,
								textTransform: 'uppercase',
								letterSpacing: '0.05em',
								color: 'var(--sl-color-gray-3)',
								margin: '0 0 8px 0',
								padding: '0 8px',
							}}>
							Graph
						</h3>
						<SiteGraph
							currentSlug={currentSlug}
							{...graphProps}
							onFullscreenChange={setFullscreen}
						/>
					</div>
					<Backlinks
						currentSlug={currentSlug}
						endpoint={graphProps.endpoint}
					/>
				</Suspense>
			</div>

			{fullscreen && (
				<Suspense fallback={null}>
					<SiteGraph
						currentSlug={currentSlug}
						{...graphProps}
						isFullscreen
						onFullscreenChange={setFullscreen}
					/>
				</Suspense>
			)}
		</>
	);
}

export default SiteGraphLoader;
