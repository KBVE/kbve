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

interface DockerEntry {
	key: string;
	app_name: string;
}

interface NpmEntry {
	key: string;
	package_name: string;
}

interface CratesEntry {
	key: string;
	package_name: string;
}

interface PythonEntry {
	key: string;
	package_name: string;
	pypi_name: string;
}

interface UnrealEntry {
	key: string;
	plugin_name: string;
	plugin_path: string;
	dependency_plugins?: string;
	itch_game_id?: string;
}

interface DispatchManifest {
	docker: DockerEntry[];
	npm: NpmEntry[];
	crates: CratesEntry[];
	python: PythonEntry[];
	unreal: UnrealEntry[];
	summary: Record<string, number>;
}

export const GET = async () => {
	const entries = await getCollection('project');

	const manifest: DispatchManifest = {
		docker: [],
		npm: [],
		crates: [],
		python: [],
		unreal: [],
		summary: {},
	};

	for (const entry of entries) {
		const d = entry.data;
		if (!d.key || !d.pipeline) continue;

		switch (d.pipeline) {
			case 'docker':
				if (d.app_name) {
					manifest.docker.push({ key: d.key, app_name: d.app_name });
				}
				break;
			case 'npm':
				if (d.package_name) {
					manifest.npm.push({
						key: d.key,
						package_name: d.package_name,
					});
				}
				break;
			case 'crates':
				if (d.package_name) {
					manifest.crates.push({
						key: d.key,
						package_name: d.package_name,
					});
				}
				break;
			case 'python':
				if (d.package_name && d.pypi_name) {
					manifest.python.push({
						key: d.key,
						package_name: d.package_name,
						pypi_name: d.pypi_name,
					});
				}
				break;
			case 'unreal':
				if (d.plugin_name && d.plugin_path) {
					const ue: UnrealEntry = {
						key: d.key,
						plugin_name: d.plugin_name,
						plugin_path: d.plugin_path,
					};
					if (d.dependency_plugins)
						ue.dependency_plugins = d.dependency_plugins;
					if (d.itch_game_id) ue.itch_game_id = d.itch_game_id;
					manifest.unreal.push(ue);
				}
				break;
		}
	}

	manifest.summary = {
		docker: manifest.docker.length,
		npm: manifest.npm.length,
		crates: manifest.crates.length,
		python: manifest.python.length,
		unreal: manifest.unreal.length,
		total:
			manifest.docker.length +
			manifest.npm.length +
			manifest.crates.length +
			manifest.python.length +
			manifest.unreal.length,
	};

	return new Response(JSON.stringify(manifest, null, 2), {
		headers: {
			'Content-Type': 'application/json',
		},
	});
};
