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
}

/**
 * Lazy-mounts SiteGraph + Backlinks on droid `panel-open` for the right
 * sidebar. Skips downloading the d3-force chunk until the user actually
 * opens the panel; once mounted, stays in the DOM (hidden) so re-opens
 * don't refetch the graph.
 */
export function SiteGraphLoader({
	currentSlug,
	collapsedAttribute = 'data-right-sidebar-collapsed',
	panelId = 'right',
	...graphProps
}: SiteGraphLoaderProps) {
	const [visible, setVisible] = useState(false);
	const [hasLoaded, setHasLoaded] = useState(false);

	useEffect(() => {
		const isOpen =
			document.documentElement.getAttribute(collapsedAttribute) !==
			'true';
		if (isOpen) {
			setVisible(true);
			setHasLoaded(true);
		}

		const offOpen = DroidEvents.on('panel-open', (payload: any) => {
			if (payload?.id === panelId) {
				setVisible(true);
				setHasLoaded(true);
			}
		});

		const offClose = DroidEvents.on('panel-close', (payload: any) => {
			if (payload?.id === panelId) {
				setVisible(false);
			}
		});

		return () => {
			offOpen();
			offClose();
		};
	}, [collapsedAttribute, panelId]);

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
					<SiteGraph currentSlug={currentSlug} {...graphProps} />
				</div>
				<Backlinks
					currentSlug={currentSlug}
					endpoint={graphProps.endpoint}
				/>
			</Suspense>
		</div>
	);
}

export default SiteGraphLoader;
