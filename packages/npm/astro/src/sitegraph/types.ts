export interface SiteGraphNode {
	title: string;
	links: string[];
	backlinks: string[];
	/** Optional relationship metadata: target slug → relationship type. */
	edges?: Record<string, string>;
}

export type SiteGraphData = Record<string, SiteGraphNode>;

/** Minimal entry shape consumed by extractors. Compatible with Astro `CollectionEntry`. */
export interface SiteGraphEntry {
	id: string;
	body?: string;
	data: Record<string, unknown>;
}

export interface ExtractorResult {
	links: string[];
	edges?: Record<string, string>;
}

/**
 * Pluggable extractor. Receives an entry + the entry's normalized slug and
 * returns outgoing link slugs (and optional relationship metadata).
 *
 * Extractors are composed by `buildSiteGraph`; the builder dedupes links
 * and merges edge maps in registration order (later extractors win).
 */
export type Extractor = (
	entry: SiteGraphEntry,
	currentSlug: string,
) => ExtractorResult;
