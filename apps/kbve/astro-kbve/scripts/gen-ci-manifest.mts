#!/usr/bin/env -S npx tsx
/**
 * CI dispatch manifest generator — MDX is the single source of truth.
 *
 * Standalone parity path for /api/ci-registry.json: reads the same project
 * MDX frontmatter and runs the shared buildManifest(), producing a
 * byte-identical .github/ci-dispatch-manifest.json without a full Astro
 * build. Run after editing project MDX:
 *   nx run astro-kbve:gen:ci-manifest
 * Verify against the committed manifest:
 *   nx run astro-kbve:gen:ci-manifest:check
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'glob';
import matter from 'gray-matter';
import type { ICiProject } from '@/data/schema';
import { ProjectSchemaWithEngine } from '../src/data/ci/project-schema';
import {
	buildManifest,
	MDX_BASE,
	type ProjectEntry,
} from '../src/data/ci/manifest-builder';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../../..');
const projectDir = resolve(repoRoot, MDX_BASE);
const OUT = resolve(repoRoot, '.github/ci-dispatch-manifest.json');

function loadEntries(): ProjectEntry[] {
	const files = globSync('**/*.mdx', { cwd: projectDir, absolute: true });
	const entries: ProjectEntry[] = files.map((file) => {
		const id = relative(projectDir, file)
			.replace(/\\/g, '/')
			.replace(/\.mdx$/, '');
		const { data } = matter(readFileSync(file, 'utf8'));
		return {
			id,
			data: ProjectSchemaWithEngine.parse(data) as ICiProject,
		};
	});
	entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	return entries;
}

function serialize(): string {
	const { index, ...manifest } = buildManifest(loadEntries());
	return JSON.stringify(manifest, null, '\t') + '\n';
}

const check = process.argv.includes('--check');
const output = serialize();

if (check) {
	const current = readFileSync(OUT, 'utf8');
	if (current === output) {
		const total = JSON.parse(output).summary.total;
		console.log(`ci-dispatch-manifest.json in sync — ${total} tracked items`);
		process.exit(0);
	}
	console.error(
		'ci-dispatch-manifest.json is stale — run `nx run astro-kbve:gen:ci-manifest`',
	);
	process.exit(1);
}

writeFileSync(OUT, output);
console.log(
	`Wrote ${relative(repoRoot, OUT)} — ${JSON.parse(output).summary.total} tracked items`,
);
