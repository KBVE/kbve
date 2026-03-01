/**
 * Sitemap-driven weighted route sampler.
 *
 * Pipeline:  sitemap → (core ∪ wsample(N, seed)) → routes
 *
 * - Core routes are always tested.
 * - Remaining sitemap routes are weighted by prefix and sampled
 *   using a deterministic seed (GITHUB_RUN_ID in CI, fixed locally).
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Routes that are always tested regardless of sampling. */
export const CORE_ROUTES = [
	'/',
	'/guides/getting-started',
	'/auth/callback',
	'/feed',
	'/profile',
];

/** Prefix → weight.  0 = exclude entirely. */
const PREFIX_WEIGHTS: [string, number][] = [
	['/docs/', 5],
	['/guides/', 5],
	['/blog/', 2],
	['/legal/', 1],
	['/api/', 0],
	['/auth/', 0],
];

const DEFAULT_WEIGHT = 1;

/** How many non-core routes to sample. */
const DEFAULT_SAMPLE_SIZE = 10;

// ---------------------------------------------------------------------------
// Seeded PRNG  (mulberry32)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function getSeed(): number {
	const runId = process.env['GITHUB_RUN_ID'];
	return runId ? parseInt(runId, 10) : 42;
}

// ---------------------------------------------------------------------------
// Sitemap fetching
// ---------------------------------------------------------------------------

/**
 * Fetch sitemap-index.xml, resolve child sitemaps, extract all <loc> paths.
 * Returns de-duped relative paths (e.g. "/docs/getting-started").
 */
export async function fetchSitemapRoutes(baseURL: string): Promise<string[]> {
	const indexBody = await fetchText(`${baseURL}/sitemap-index.xml`);
	const sitemapUrls = extractLocs(indexBody);

	const allLocs: string[] = [];
	for (const url of sitemapUrls) {
		// Rewrite absolute sitemap URL to hit the local server
		const path = new URL(url).pathname;
		const body = await fetchText(`${baseURL}${path}`);
		allLocs.push(...extractLocs(body));
	}

	// Convert absolute URLs to relative paths, de-dup
	const seen = new Set<string>();
	const routes: string[] = [];
	for (const loc of allLocs) {
		let path: string;
		try {
			path = new URL(loc).pathname;
		} catch {
			path = loc;
		}
		// Normalise: strip trailing slash (keep "/" as-is)
		const normalised = path === '/' ? '/' : path.replace(/\/+$/, '');
		if (!seen.has(normalised)) {
			seen.add(normalised);
			routes.push(normalised);
		}
	}
	return routes;
}

function extractLocs(xml: string): string[] {
	const matches: string[] = [];
	const re = /<loc>(.*?)<\/loc>/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(xml)) !== null) {
		matches.push(m[1]);
	}
	return matches;
}

async function fetchText(url: string): Promise<string> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${url} → ${res.status}`);
	return res.text();
}

// ---------------------------------------------------------------------------
// Weighted sampling  (Efraimidis-Spirakis)
// ---------------------------------------------------------------------------

function weightForRoute(route: string): number {
	for (const [prefix, w] of PREFIX_WEIGHTS) {
		if (route.startsWith(prefix)) return w;
	}
	return DEFAULT_WEIGHT;
}

function weightedSample(
	candidates: string[],
	k: number,
	rng: () => number,
): string[] {
	const keyed = candidates
		.map((route) => ({ route, weight: weightForRoute(route) }))
		.filter((x) => x.weight > 0)
		.map((x) => ({ route: x.route, key: Math.pow(rng(), 1 / x.weight) }));

	keyed.sort((a, b) => b.key - a.key);
	return keyed.slice(0, k).map((x) => x.route);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the final set of routes to smoke-test:
 *   core (always)  ∪  weightedSample(remaining, N, seed)
 */
export async function sampleRoutes(
	baseURL: string,
	sampleSize = DEFAULT_SAMPLE_SIZE,
): Promise<{ core: string[]; sampled: string[]; all: string[] }> {
	let sitemapRoutes: string[];
	try {
		sitemapRoutes = await fetchSitemapRoutes(baseURL);
	} catch {
		// Sitemap missing or unparseable — fall back to core only
		return { core: CORE_ROUTES, sampled: [], all: CORE_ROUTES };
	}

	const coreSet = new Set(CORE_ROUTES);

	// Only keep core routes that actually exist in the sitemap (or keep all core as-is)
	const core = CORE_ROUTES.filter(
		(r) => sitemapRoutes.includes(r) || !sitemapRoutes.length,
	);

	// Candidates = sitemap routes minus core
	const candidates = sitemapRoutes.filter((r) => !coreSet.has(r));

	const rng = mulberry32(getSeed());
	const k = Math.min(sampleSize, candidates.length);
	const sampled = weightedSample(candidates, k, rng);

	const allSet = new Set([...core, ...sampled]);
	return { core, sampled, all: [...allSet] };
}
