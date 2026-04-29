import { SiteGraphLoader } from '@kbve/astro';
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
 */
export default function SiteGraphHost({ currentSlug }: Props) {
	return (
		<SiteGraphLoader
			currentSlug={currentSlug}
			edgeColors={osrsEdgeColors}
			tagOf={osrsTagOf}
			tagStyles={osrsTagStyles}
		/>
	);
}
