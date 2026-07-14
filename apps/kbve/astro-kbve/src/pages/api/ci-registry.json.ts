/**
 * CI Registry API — /api/ci-registry.json
 *
 * Reads all project collection entries with CI frontmatter and outputs
 * the dispatch manifest JSON grouped by pipeline. This is the same shape
 * that ci-main.yml consumes from .github/ci-dispatch-manifest.json.
 *
 * The manifest shape lives in src/data/ci/manifest-builder.ts so the
 * standalone tsx generator (scripts/gen-ci-manifest.mts) can produce the
 * identical output without a full Astro build:
 *   Proto → Zod → MDX frontmatter → buildManifest → ci-dispatch-manifest.json
 */
import { getCollection } from 'astro:content';
import type { ICiProject } from '@/data/schema';
import { buildManifest, type ProjectEntry } from '@/data/ci/manifest-builder';

export const GET = async () => {
	const entries: ProjectEntry[] = (await getCollection('project')).map(
		(entry: { id: string; data: ICiProject }) => ({
			id: entry.id,
			data: entry.data,
		}),
	);

	const manifest = buildManifest(entries);

	return new Response(JSON.stringify(manifest, null, 2), {
		headers: {
			'Content-Type': 'application/json',
		},
	});
};
