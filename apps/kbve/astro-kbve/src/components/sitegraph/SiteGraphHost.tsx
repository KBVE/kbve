import { useEffect, useRef, useState } from 'react';
import { SiteGraphLoader, createSiteGraphWorker } from '@kbve/astro';
import {
	osrsEdgeColors,
	osrsEdgeDashes,
	osrsEdgeLabels,
	osrsTagLabels,
	osrsTagOf,
	osrsTagStyles,
} from '../../lib/sitegraph/osrs-extractor';

interface Props {
	currentSlug: string;
}

/**
 * Site-specific bindings for the shared SiteGraph: OSRS edge colors,
 * tag function, and tag styles. New domains (npcdb, itemdb, ...) wire
 * their own extractor + visuals here.
 *
 * Defers the heavy SiteGraph (d3-force + fetch + SharedWorker) until the
 * sidebar slot nears the viewport — on the many docs pages where the graph
 * is never scrolled into view it costs zero main-thread work.
 */
export default function SiteGraphHost({ currentSlug }: Props) {
	const sentinelRef = useRef<HTMLDivElement>(null);
	const [show, setShow] = useState(false);

	useEffect(() => {
		const el = sentinelRef.current;
		if (!el || typeof IntersectionObserver === 'undefined') {
			setShow(true);
			return;
		}
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					setShow(true);
					io.disconnect();
				}
			},
			{ rootMargin: '300px' },
		);
		io.observe(el);
		return () => io.disconnect();
	}, []);

	useEffect(() => {
		if (show) createSiteGraphWorker();
	}, [show]);

	if (!show) {
		return <div ref={sentinelRef} className="sg-defer" aria-hidden="true" />;
	}

	return (
		<SiteGraphLoader
			currentSlug={currentSlug}
			edgeColors={osrsEdgeColors}
			edgeDashes={osrsEdgeDashes}
			edgeLabels={osrsEdgeLabels}
			tagOf={osrsTagOf}
			tagStyles={osrsTagStyles}
			tagLabels={osrsTagLabels}
		/>
	);
}
