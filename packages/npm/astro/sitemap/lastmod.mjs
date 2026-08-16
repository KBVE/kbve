import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROUTE_EXTENSIONS = new Set(['.astro', '.md', '.mdx', '.mdoc', '.html']);
const ISO_LINE = /^\d{4}-\d{2}-\d{2}T/;

function git(args, cwd) {
	return execFileSync('git', args, {
		cwd,
		encoding: 'utf8',
		maxBuffer: 256 * 1024 * 1024,
		stdio: ['ignore', 'pipe', 'ignore'],
	}).trim();
}

function isShallow(repoRoot) {
	return git(['rev-parse', '--is-shallow-repository'], repoRoot) === 'true';
}

/**
 * Last commit date per file, from a single `git log` walk over the app source.
 * Output is newest-first, so the first sighting of a path is its latest commit.
 * Keys are repo-root-relative POSIX paths, matching git's own output.
 */
function commitDates(repoRoot, scopes) {
	const dates = new Map();
	const raw = git(
		['log', '--format=%cI', '--name-only', '--no-merges', '--', ...scopes],
		repoRoot,
	);
	let current = null;
	for (const line of raw.split('\n')) {
		if (line === '') continue;
		if (ISO_LINE.test(line)) {
			current = line;
			continue;
		}
		if (current && !dates.has(line)) dates.set(line, current);
	}
	return dates;
}

function walk(dir, out = []) {
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

function routeKey(pathname) {
	const trimmed = pathname.replace(/\/+$/, '');
	return trimmed === '' ? '/' : trimmed;
}

/**
 * Route for a source file, relative to the directory that owns its routes.
 * `index` collapses to its parent. Dynamic segments cannot be resolved back to
 * a single URL, so those files are skipped rather than guessed at.
 */
function routeFor(baseDir, file, prefix) {
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
 * Build a `serialize` hook for @astrojs/sitemap that stamps each URL with the
 * commit date of the file that produces it.
 *
 * Unknown URLs are left without a lastmod on purpose: a wrong date is a worse
 * recrawl signal than no date, and dynamic routes have no single source file.
 * A shallow clone is treated the same way — its one synthetic commit date would
 * otherwise mark the entire site as freshly updated on every build.
 */
export function createSitemapLastmod(options = {}) {
	const {
		appDir,
		srcDir = 'src',
		contentCollections = { docs: '/' },
		pagesDir = 'pages',
		base = '/',
	} = options;

	if (!appDir) throw new Error('createSitemapLastmod: appDir is required');

	const routes = new Map();
	let skipped = null;

	try {
		const repoRoot = git(['rev-parse', '--show-toplevel'], appDir);

		if (isShallow(repoRoot)) {
			skipped = 'shallow clone (needs full history for real commit dates)';
		} else {
			const src = path.join(appDir, srcDir);
			const scopes = [path.relative(repoRoot, src) || '.'];
			const dates = commitDates(repoRoot, scopes);

			const roots = [];
			for (const [collection, prefix] of Object.entries(
				contentCollections,
			)) {
				roots.push({
					dir: path.join(src, 'content', collection),
					prefix,
				});
			}
			if (pagesDir) {
				roots.push({ dir: path.join(src, pagesDir), prefix: '/' });
			}

			for (const { dir, prefix } of roots) {
				for (const file of walk(dir)) {
					const route = routeFor(dir, file, prefix);
					if (!route) continue;
					const key = path
						.relative(repoRoot, file)
						.split(path.sep)
						.join('/');
					const date = dates.get(key);
					if (date) routes.set(route, date);
				}
			}
		}
	} catch (err) {
		skipped = `git unavailable (${err.message})`;
	}

	if (skipped) {
		console.warn(`[sitemap-lastmod] no lastmod emitted — ${skipped}`);
	} else {
		console.info(`[sitemap-lastmod] ${routes.size} routes dated`);
	}

	const basePrefix = base === '/' ? '' : base.replace(/\/+$/, '');

	return function serialize(item) {
		if (!routes.size) return item;
		let pathname;
		try {
			pathname = new URL(item.url).pathname;
		} catch {
			return item;
		}
		if (basePrefix && pathname.startsWith(basePrefix)) {
			pathname = pathname.slice(basePrefix.length) || '/';
		}
		const date = routes.get(routeKey(pathname));
		if (date) item.lastmod = date;
		return item;
	};
}
