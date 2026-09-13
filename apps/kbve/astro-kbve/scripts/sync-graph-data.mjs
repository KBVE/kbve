import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Publish the committed graph data into the app's `public/`.
 *
 * `packages/data/graph/monorepo` is the source of truth for every graph
 * artifact; the browser fetches the chunks at runtime, so the site needs its
 * own served copy. That copy is generated rather than committed, which is why
 * it is git-ignored — a second committed copy is how a stale one gets shipped.
 *
 * Paths come from this file's own location, not the working directory: moon
 * runs the task from the project source dir and a developer runs it from
 * wherever they happen to be.
 */
const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const ROOT = join(APP, '..', '..', '..');
const SOURCE = join(ROOT, 'packages', 'data', 'graph', 'monorepo');

const COPIES = [
	['overview.json', 'public/graphify/overview.json'],
	['dir', 'public/graphify/dir'],
	['projects.json', 'public/data/dashboard/graph.json'],
];

if (!existsSync(SOURCE)) {
	console.error(`graph data missing at ${SOURCE}`);
	process.exit(1);
}

for (const [from, to] of COPIES) {
	const src = join(SOURCE, from);
	const dest = join(APP, to);
	if (!existsSync(src)) {
		console.error(`graph data missing: ${src}`);
		process.exit(1);
	}
	await rm(dest, { recursive: true, force: true });
	await mkdir(dirname(dest), { recursive: true });
	await cp(src, dest, { recursive: true });
	console.log(`${from} -> ${to}`);
}
