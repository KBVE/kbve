import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { collectRoutes, pathnameFor } from './routes.mjs';

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

	const dated = new Map();
	let skipped = null;

	try {
		const repoRoot = git(['rev-parse', '--show-toplevel'], appDir);

		if (isShallow(repoRoot)) {
			skipped = 'shallow clone (needs full history for real commit dates)';
		} else {
			const src = path.join(appDir, srcDir);
			const dates = commitDates(repoRoot, [
				path.relative(repoRoot, src) || '.',
			]);
			const routes = collectRoutes({
				appDir,
				srcDir,
				contentCollections,
				pagesDir,
			});
			for (const [route, file] of routes) {
				const key = path
					.relative(repoRoot, file)
					.split(path.sep)
					.join('/');
				const date = dates.get(key);
				if (date) dated.set(route, date);
			}
		}
	} catch (err) {
		skipped = `git unavailable (${err.message})`;
	}

	if (skipped) {
		console.warn(`[sitemap-lastmod] no lastmod emitted — ${skipped}`);
	} else {
		console.info(`[sitemap-lastmod] ${dated.size} routes dated`);
	}

	return function serialize(item) {
		if (!dated.size) return item;
		const key = pathnameFor(item.url, base);
		const date = key && dated.get(key);
		if (date) item.lastmod = date;
		return item;
	};
}
