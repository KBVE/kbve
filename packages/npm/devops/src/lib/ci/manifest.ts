/**
 * Dispatch Manifest Builder
 *
 * Transforms the CI registry into the JSON format consumed by
 * ci-main.yml's dispatch jobs. Output is written to:
 *   .github/ci-dispatch-manifest.json
 */

import { type CiProject } from './ci_registry-schema.js';
import { CI_PROJECTS } from './registry.js';

// ---------------------------------------------------------------------------
// Manifest shape — matches what ci-main.yml dispatch steps expect
// ---------------------------------------------------------------------------

export interface DockerEntry {
	key: string;
	app_name: string;
}

export interface NpmEntry {
	key: string;
	package_name: string;
}

export interface CratesEntry {
	key: string;
	package_name: string;
}

export interface PythonEntry {
	key: string;
	package_name: string;
	pypi_name: string;
}

export interface UnrealEntry {
	key: string;
	plugin_name: string;
	plugin_path: string;
	dependency_plugins?: string;
	itch_game_id?: string;
}

export interface Ue5ServerEntry {
	key: string;
	app_name: string;
	shell_path: string;
}

export interface DispatchManifest {
	docker: DockerEntry[];
	npm: NpmEntry[];
	crates: CratesEntry[];
	python: PythonEntry[];
	unreal: UnrealEntry[];
	ue5_server: Ue5ServerEntry[];
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

function toDocker(p: CiProject): DockerEntry {
	if (!p.app_name)
		throw new Error(`Docker project "${p.key}" missing app_name`);
	return { key: p.key, app_name: p.app_name };
}

function toNpm(p: CiProject): NpmEntry {
	if (!p.package_name)
		throw new Error(`NPM project "${p.key}" missing package_name`);
	return { key: p.key, package_name: p.package_name };
}

function toCrates(p: CiProject): CratesEntry {
	if (!p.package_name)
		throw new Error(`Crate project "${p.key}" missing package_name`);
	return { key: p.key, package_name: p.package_name };
}

function toPython(p: CiProject): PythonEntry {
	if (!p.package_name)
		throw new Error(`Python project "${p.key}" missing package_name`);
	if (!p.pypi_name)
		throw new Error(`Python project "${p.key}" missing pypi_name`);
	return { key: p.key, package_name: p.package_name, pypi_name: p.pypi_name };
}

function toUnreal(p: CiProject): UnrealEntry {
	if (!p.plugin_name)
		throw new Error(`Unreal project "${p.key}" missing plugin_name`);
	if (!p.plugin_path)
		throw new Error(`Unreal project "${p.key}" missing plugin_path`);
	const entry: UnrealEntry = {
		key: p.key,
		plugin_name: p.plugin_name,
		plugin_path: p.plugin_path,
	};
	if (p.dependency_plugins) entry.dependency_plugins = p.dependency_plugins;
	if (p.itch_game_id) entry.itch_game_id = p.itch_game_id;
	return entry;
}

function toUe5Server(p: CiProject): Ue5ServerEntry {
	if (!p.app_name)
		throw new Error(`UE5 server project "${p.key}" missing app_name`);
	if (!p.shell_path)
		throw new Error(`UE5 server project "${p.key}" missing shell_path`);
	return { key: p.key, app_name: p.app_name, shell_path: p.shell_path };
}

const mappers: Record<
	string,
	(
		p: CiProject,
	) =>
		| DockerEntry
		| NpmEntry
		| CratesEntry
		| PythonEntry
		| UnrealEntry
		| Ue5ServerEntry
> = {
	docker: toDocker,
	npm: toNpm,
	crates: toCrates,
	python: toPython,
	unreal: toUnreal,
	ue5_server: toUe5Server,
};

/**
 * Build the dispatch manifest from the CI registry.
 * This is the JSON that ci-main.yml reads to fan out dispatches.
 */
export function buildDispatchManifest(): DispatchManifest {
	const manifest: DispatchManifest = {
		docker: [],
		npm: [],
		crates: [],
		python: [],
		unreal: [],
		ue5_server: [],
	};

	for (const project of CI_PROJECTS) {
		const mapper = mappers[project.pipeline];
		if (!mapper) {
			throw new Error(
				`Unknown pipeline "${project.pipeline}" for project "${project.key}"`,
			);
		}
		(
			manifest[project.pipeline as keyof DispatchManifest] as unknown[]
		).push(mapper(project));
	}

	return manifest;
}
