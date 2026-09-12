import { readFileSync } from 'node:fs';

import { graphDataPath } from './dataPaths';

/**
 * Build-time reader for the Graphify tiered overview.
 *
 * The overview is committed under `packages/data/graph/monorepo` and rebuilt by
 * the weekly `graphify` content route, so it is absent on any checkout taken
 * between a failed rebuild and the next good one. A static
 * `import ... from '.../overview.json'` turns that gap into an
 * unresolved-import build failure for the whole site, which is how the `/graph/`
 * hub took `astro-kbve:build` down. Reading it here keeps the page rendering
 * with zeroed counts instead.
 */

export interface GraphifyOverview {
	meta: {
		dirs: number;
		files: number;
		symbols: number;
		dirEdges: number;
		built_at_commit: string;
		scale: number;
		relations: string[];
	};
	dirs: Array<{ id: string; label: string }>;
	dirEdges: Array<[number, number, number, number]>;
}

export const EMPTY_OVERVIEW: GraphifyOverview = {
	meta: {
		dirs: 0,
		files: 0,
		symbols: 0,
		dirEdges: 0,
		built_at_commit: '',
		scale: 1,
		relations: [],
	},
	dirs: [],
	dirEdges: [],
};

export function loadGraphifyOverview(): GraphifyOverview {
	try {
		const path = graphDataPath('overview.json');
		if (!path) return EMPTY_OVERVIEW;
		return JSON.parse(readFileSync(path, 'utf-8')) as GraphifyOverview;
	} catch {
		return EMPTY_OVERVIEW;
	}
}
