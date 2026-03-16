import { BASE_URL } from './http';

/**
 * Parse all <loc> URLs from a sitemap XML string.
 */
function extractLocs(xml: string): string[] {
	const matches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
	return [...matches].map((m) => m[1]);
}

/**
 * Fetch the sitemap index and all child sitemaps, returning every
 * URL as a path (relative to the site root).
 */
export async function fetchAllSitemapPaths(): Promise<string[]> {
	const indexRes = await fetch(`${BASE_URL}/sitemap-index.xml`);
	if (indexRes.status !== 200) return [];

	const indexXml = await indexRes.text();
	const sitemapUrls = extractLocs(indexXml);

	const paths: string[] = [];

	for (const url of sitemapUrls) {
		// Convert absolute URL to relative path for fetching from the container
		const sitemapPath = new URL(url).pathname;
		const res = await fetch(`${BASE_URL}${sitemapPath}`);
		if (res.status !== 200) continue;

		const xml = await res.text();
		for (const loc of extractLocs(xml)) {
			try {
				paths.push(new URL(loc).pathname);
			} catch {
				// Skip malformed URLs
			}
		}
	}

	return paths;
}

/**
 * Filter sitemap paths by a prefix (e.g. "/itemdb/") and return
 * a sampled subset to keep test runtime reasonable.
 */
export function samplePaths(
	paths: string[],
	prefix: string,
	maxSamples = 5,
): string[] {
	const matching = paths.filter((p) => p.startsWith(prefix) && p !== prefix);
	if (matching.length <= maxSamples) return matching;

	// Deterministic sample: first, last, and evenly spaced middle entries
	const step = Math.floor(matching.length / maxSamples);
	return Array.from({ length: maxSamples }, (_, i) =>
		i === maxSamples - 1
			? matching[matching.length - 1]
			: matching[i * step],
	);
}
