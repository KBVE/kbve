import { useEffect, useState, lazy, Suspense } from 'react';
import { DroidEvents } from '@kbve/droid';

const SiteGraph = lazy(() => import('./SiteGraph'));
const Backlinks = lazy(() => import('./Backlinks'));

interface SiteGraphLoaderProps {
	currentSlug: string;
}

/**
 * Lazy-loads the site graph and backlinks only when the right sidebar
 * is expanded. Listens to the droid event bus for panel-open/panel-close.
 *
 * Zero JS parsed on page load — the graph module is never downloaded
 * unless the user opens the right sidebar.
 */
export default function SiteGraphLoader({ currentSlug }: SiteGraphLoaderProps) {
	const [visible, setVisible] = useState(false);
	const [hasLoaded, setHasLoaded] = useState(false);

	useEffect(() => {
		// Check initial state from DOM attribute
		const isOpen =
			document.documentElement.getAttribute(
				'data-right-sidebar-collapsed',
			) !== 'true';
		if (isOpen) {
			setVisible(true);
			setHasLoaded(true);
		}

		const offOpen = DroidEvents.on('panel-open', (payload: any) => {
			if (payload?.id === 'right') {
				setVisible(true);
				setHasLoaded(true);
			}
		});

		const offClose = DroidEvents.on('panel-close', (payload: any) => {
			if (payload?.id === 'right') {
				setVisible(false);
			}
		});

		return () => {
			offOpen();
			offClose();
		};
	}, []);

	// Once loaded, keep mounted but hidden (avoids refetching sitemap)
	if (!hasLoaded) return null;

	return (
		<div
			className="sg-container"
			style={{
				display: visible ? 'block' : 'none',
				padding: '8px 0',
			}}>
			<Suspense fallback={null}>
				<div style={{ marginBottom: '12px' }}>
					<h3
						style={{
							fontSize: '12px',
							fontWeight: 600,
							textTransform: 'uppercase',
							letterSpacing: '0.05em',
							color: 'var(--sl-color-gray-3)',
							margin: '0 0 8px 0',
						}}>
						Graph
					</h3>
					<SiteGraph currentSlug={currentSlug} />
				</div>
				<Backlinks currentSlug={currentSlug} />
			</Suspense>
		</div>
	);
}
