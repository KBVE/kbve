import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const RELATIVE = join('packages', 'data', 'graph', 'monorepo');

/**
 * Absolute path of the committed graph data, resolved by walking up from the
 * working directory.
 *
 * The data is one artifact under `packages/data/graph/monorepo` — the tiered
 * graphify overview, its per-directory chunks, and the moon project graph. The
 * copies the browser fetches from `/graphify` and `/data/dashboard/graph.json`
 * are written by `astro-kbve:sync-graph`, so build-time readers take the
 * package and never depend on that copy having happened.
 *
 * Resolved by search rather than a fixed `../../../` because the working
 * directory differs between an Astro build (the app), a vitest run (the app or
 * the workspace root) and a moon task invoked from elsewhere in the tree.
 */
export function graphDataDir(from: string = process.cwd()): string | null {
	let dir = from;
	for (;;) {
		if (existsSync(join(dir, RELATIVE))) return join(dir, RELATIVE);
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

export function graphDataPath(...segments: string[]): string | null {
	const dir = graphDataDir();
	return dir ? join(dir, ...segments) : null;
}
