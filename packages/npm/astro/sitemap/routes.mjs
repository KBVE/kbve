import { readdirSync } from 'node:fs';
import path from 'node:path';

const ROUTE_EXTENSIONS = new Set(['.astro', '.md', '.mdx', '.mdoc', '.html']);

export function routeKey(pathname) {
	const trimmed = pathname.replace(/\/+$/, '');
	return trimmed === '' ? '/' : trimmed;
}

export function walk(dir, out = []) {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full, out);
		else if (entry.isFile()) out.push(full);
	}
	return out;
}

/**
 * Route for a source file, relative to the directory that owns its routes.
 * `index` collapses to its parent. Dynamic segments cannot be resolved back to
 * a single URL, so those files are skipped rather than guessed at.
 */
export function routeFor(baseDir, file, prefix) {
	const rel = path.relative(baseDir, file).split(path.sep).join('/');
	const ext = path.extname(rel);
	if (!ROUTE_EXTENSIONS.has(ext)) return null;
	if (rel.includes('[')) return null;
	if (path.basename(rel).startsWith('_')) return null;

	let slug = rel.slice(0, -ext.length);
	if (slug === 'index') slug = '';
	else slug = slug.replace(/\/index$/, '');

	return routeKey(`${prefix}/${slug}`.replace(/\/{2,}/g, '/'));
}

/**
 * Map every statically resolvable route in an app to the file that renders it.
 */
export function collectRoutes({
	appDir,
	srcDir = 'src',
	contentCollections = { docs: '/' },
	pagesDir = 'pages',
}) {
	const src = path.join(appDir, srcDir);
	const roots = [];
	for (const [collection, prefix] of Object.entries(contentCollections)) {
		roots.push({ dir: path.join(src, 'content', collection), prefix });
	}
	if (pagesDir) roots.push({ dir: path.join(src, pagesDir), prefix: '/' });

	const routes = new Map();
	for (const { dir, prefix } of roots) {
		for (const file of walk(dir)) {
			const route = routeFor(dir, file, prefix);
			if (route && !routes.has(route)) routes.set(route, file);
		}
	}
	return routes;
}

export function pathnameFor(url, base = '/') {
	let pathname;
	try {
		pathname = new URL(url).pathname;
	} catch {
		return null;
	}
	const prefix = base === '/' ? '' : base.replace(/\/+$/, '');
	if (prefix && pathname.startsWith(prefix)) {
		pathname = pathname.slice(prefix.length) || '/';
	}
	return routeKey(pathname);
}
