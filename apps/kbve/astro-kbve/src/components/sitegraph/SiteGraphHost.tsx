import { useEffect } from 'react';
import { SiteGraphLoader, createSiteGraphWorker } from '@kbve/astro';
import {
	osrsEdgeColors,
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
 * Boots a SharedWorker on mount so the parsed graph is shared across
 * tabs; the loader's cache transparently routes through the worker port.
 */
export default function SiteGraphHost({ currentSlug }: Props) {
	useEffect(() => {
		createSiteGraphWorker();
	}, []);

	return (
		<SiteGraphLoader
			currentSlug={currentSlug}
			edgeColors={osrsEdgeColors}
			tagOf={osrsTagOf}
			tagStyles={osrsTagStyles}
		/>
	);
}
