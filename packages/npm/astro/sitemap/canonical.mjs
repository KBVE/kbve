import { readFileSync } from 'node:fs';
import { collectRoutes, pathnameFor, routeKey } from './routes.mjs';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const CANONICAL = /^canonical:\s*(?:"([^"]+)"|'([^']+)'|(\S+))\s*$/m;

function declaredCanonical(file) {
	let head;
	try {
		head = readFileSync(file, 'utf8').slice(0, 8192);
	} catch {
		return null;
	}
	const fm = FRONTMATTER.exec(head);
	if (!fm) return null;
	const m = CANONICAL.exec(fm[1]);
	if (!m) return null;
	return (m[1] ?? m[2] ?? m[3]).trim();
}

/**
 * Build a `filter` hook for @astrojs/sitemap that drops URLs whose page
 * declares a different canonical.
 *
 * A page that points `rel=canonical` at another URL has already said it is not
 * the version to index; listing it in the sitemap asks for the opposite and
 * spends crawl budget re-discovering a duplicate. Pages stay reachable through
 * ordinary links either way — this only changes what is advertised.
 *
 * Only same-origin canonicals that resolve to a known route are treated as
 * self-referencing; anything unparseable leaves the URL in the sitemap, since
 * dropping a page is the more damaging way to be wrong.
 */
export function createCanonicalFilter(options = {}) {
	const {
		appDir,
		srcDir = 'src',
		contentCollections = { docs: '/' },
		pagesDir = 'pages',
		base = '/',
	} = options;

	if (!appDir) throw new Error('createCanonicalFilter: appDir is required');

	const elsewhere = new Set();

	try {
		const routes = collectRoutes({
			appDir,
			srcDir,
			contentCollections,
			pagesDir,
		});
		for (const [route, file] of routes) {
			const declared = declaredCanonical(file);
			if (!declared) continue;
			const target = declared.startsWith('http')
				? pathnameFor(declared, base)
				: routeKey(declared);
			if (target && target !== route) elsewhere.add(route);
		}
	} catch (err) {
		console.warn(`[sitemap-canonical] scan failed (${err.message})`);
	}

	console.info(
		`[sitemap-canonical] ${elsewhere.size} non-canonical routes excluded`,
	);

	return function filter(url) {
		const key = pathnameFor(url, base);
		return key ? !elsewhere.has(key) : true;
	};
}
