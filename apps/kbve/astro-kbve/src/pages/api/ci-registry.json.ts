/**
 * CI Registry API — /api/ci-registry.json
 *
 * Reads all project collection entries with CI frontmatter and outputs
 * the dispatch manifest JSON grouped by pipeline. This is the same shape
 * that ci-main.yml consumes from .github/ci-dispatch-manifest.json.
 *
 * The build step can write this output to the manifest file, closing the loop:
 *   Proto → Zod → MDX frontmatter → /api/ci-registry.json → ci-dispatch-manifest.json
 */
import { getCollection } from 'astro:content';
import type { ICiProject } from '@/data/schema';
import { DispatchPipelines } from '@/data/schema';

interface DockerEntry {
	key: string;
	app_name: string;
	version?: string;
	version_toml?: string;
	version_source?: string;
	source_path?: string;
}

interface NpmEntry {
	key: string;
	package_name: string;
	version?: string;
	version_toml?: string;
}

interface CratesEntry {
	key: string;
	package_name: string;
	version?: string;
	version_toml?: string;
}

interface PythonEntry {
	key: string;
	package_name: string;
	pypi_name: string;
	version?: string;
	version_toml?: string;
}

interface UnrealEntry {
	key: string;
	plugin_name: string;
	plugin_path: string;
	dependency_plugins?: string;
	itch_game_id?: string;
	version?: string;
	version_toml?: string;
}

type ManifestEntry =
	| DockerEntry
	| NpmEntry
	| CratesEntry
	| PythonEntry
	| UnrealEntry;

interface DispatchManifest {
	docker: DockerEntry[];
	npm: NpmEntry[];
	crates: CratesEntry[];
	python: PythonEntry[];
	unreal: UnrealEntry[];
	index: Record<string, number>;
	summary: Record<string, number>;
}

/** Build a typed manifest entry from the frontmatter data, or null if required fields are missing. */
function toManifestEntry(d: ICiProject, mdxPath?: string): ManifestEntry | null {
	const vt = d.version_toml;
	const ver = d.version;
	switch (d.pipeline) {
		case 'docker':
			return d.app_name
				? {
						key: d.key!,
						app_name: d.app_name,
						...(ver && { version: ver }),
						...(vt && { version_toml: vt }),
						...(mdxPath && { version_source: mdxPath }),
						...(d.source_path && { source_path: d.source_path }),
					}
				: null;
		case 'npm':
		case 'crates':
			return d.package_name
				? {
						key: d.key!,
						package_name: d.package_name,
						...(ver && { version: ver }),
						...(vt && { version_toml: vt }),
					}
				: null;
		case 'python':
			return d.package_name && d.pypi_name
				? {
						key: d.key!,
						package_name: d.package_name,
						pypi_name: d.pypi_name,
						...(ver && { version: ver }),
						...(vt && { version_toml: vt }),
					}
				: null;
		case 'unreal': {
			if (!d.plugin_name || !d.plugin_path) return null;
			const ue: UnrealEntry = {
				key: d.key!,
				plugin_name: d.plugin_name,
				plugin_path: d.plugin_path,
			};
			if (d.dependency_plugins)
				ue.dependency_plugins = d.dependency_plugins;
			if (d.itch_game_id) ue.itch_game_id = d.itch_game_id;
			if (ver) ue.version = ver;
			if (vt) ue.version_toml = vt;
			return ue;
		}
		default:
			return null;
	}
}

/** Validate that all CI keys are unique — throws at build time if not. */
function validateKeyUniqueness(
	projects: Array<{ key: string; pipeline: string }>,
) {
	const seen = new Set<string>();
	for (const p of projects) {
		if (seen.has(p.key)) {
			throw new Error(
				`Duplicate CI registry key detected: ${p.key} (pipeline: ${p.pipeline})`,
			);
		}
		seen.add(p.key);
	}
}

export const GET = async () => {
	const entries = (await getCollection('project')).filter(
		(entry: { id: string; data: ICiProject }) =>
			!entry.id.endsWith('index.mdx') &&
			entry.data.key &&
			entry.data.pipeline,
	);

	const manifest: DispatchManifest = {
		docker: [],
		npm: [],
		crates: [],
		python: [],
		unreal: [],
		index: {},
		summary: {},
	};

	const tracked: Array<{ key: string; pipeline: string }> = [];

	for (const entry of entries) {
		const d = entry.data as ICiProject;
		if (!d.key || !d.pipeline) continue;

		// Derive the MDX path from the Astro entry ID for version_source
		const mdxPath = `apps/kbve/astro-kbve/src/content/docs/project/${entry.id}.mdx`;
		const me = toManifestEntry(d, mdxPath);
		if (!me) continue;

		const pipeline = d.pipeline as keyof Pick<
			DispatchManifest,
			'docker' | 'npm' | 'crates' | 'python' | 'unreal'
		>;
		const arr = manifest[pipeline] as ManifestEntry[];
		const idx = arr.length;
		arr.push(me);

		tracked.push({ key: d.key, pipeline: d.pipeline });

		// Index by key and entry id for fast lookup
		manifest.index[d.key] = idx;
		manifest.index[entry.id] = idx;
	}

	validateKeyUniqueness(tracked);

	manifest.summary = {
		...Object.fromEntries(
			DispatchPipelines.map((p) => [
				p,
				(manifest[p as keyof DispatchManifest] as ManifestEntry[])
					?.length ?? 0,
			]),
		),
		total: tracked.length,
	};

	return new Response(JSON.stringify(manifest, null, 2), {
		headers: {
			'Content-Type': 'application/json',
		},
	});
};
