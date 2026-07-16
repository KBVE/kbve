import type { ExternalPublish, ICiProject } from '@/data/schema';
import { DispatchPipelines } from '@kbve/proto/ci_registry-schema';

export const MDX_BASE = 'apps/kbve/astro-kbve/src/content/docs/project';

interface DockerEntry {
	key: string;
	app_name: string;
	version?: string;
	version_toml?: string;
	version_source?: string;
	version_target?: string;
	source_path?: string;
	runner?: string;
	image?: string;
	e2e_name?: string;
	deployment_yaml?: string;
	deployment_yamls?: string[];
	has_test?: boolean;
	target?: string;
	nx_project?: string;
	external_publish?: ExternalPublish;
}

interface NpmEntry {
	key: string;
	package_name: string;
	version?: string;
	version_toml?: string;
	version_source?: string;
	version_target?: string;
}

interface CratesEntry {
	key: string;
	package_name: string;
	version?: string;
	version_toml?: string;
	version_source?: string;
	version_target?: string;
}

interface PythonEntry {
	key: string;
	package_name: string;
	pypi_name: string;
	version?: string;
	version_toml?: string;
	version_source?: string;
	version_target?: string;
}

interface UnrealEntry {
	key: string;
	plugin_name: string;
	plugin_path: string;
	dependency_plugins?: string;
	itch_game_id?: string;
	supported_platforms?: string[];
	version?: string;
	version_toml?: string;
	version_source?: string;
}

interface Ue5ServerEntry {
	key: string;
	app_name: string;
	shell_path: string;
	version?: string;
	version_toml?: string;
}

interface GameEntryBase {
	key: string;
	app_name: string;
	source_path?: string;
	version?: string;
	version_toml?: string;
	version_source?: string;
	version_target?: string;
	runner?: string;
	has_test?: boolean;
	engine: NonNullable<ICiProject['engine']>;
	external_publish?: ICiProject['external_publish'];
	shell_path?: string;
}

interface UnityEntry extends GameEntryBase {}
interface GodotEntry extends GameEntryBase {}
interface UnrealGameEntry extends GameEntryBase {}
interface BevyGameEntry extends GameEntryBase {}
interface ViteGameEntry extends GameEntryBase {}

type ManifestEntry =
	| DockerEntry
	| NpmEntry
	| CratesEntry
	| PythonEntry
	| UnrealEntry
	| Ue5ServerEntry
	| UnityEntry
	| GodotEntry
	| UnrealGameEntry
	| BevyGameEntry
	| ViteGameEntry;

export interface DispatchManifest {
	docker: DockerEntry[];
	npm: NpmEntry[];
	crates: CratesEntry[];
	python: PythonEntry[];
	unreal: UnrealEntry[];
	ue5_server: Ue5ServerEntry[];
	unity: UnityEntry[];
	godot: GodotEntry[];
	unreal_game: UnrealGameEntry[];
	bevy_game: BevyGameEntry[];
	vite_game: ViteGameEntry[];
	index: Record<string, number>;
	summary: Record<string, number>;
}

export interface ProjectEntry {
	id: string;
	data: ICiProject;
}

function toManifestEntry(
	d: ICiProject,
	mdxPath?: string,
): ManifestEntry | null {
	const vt = d.version_toml;
	const ver = d.version;
	switch (d.pipeline) {
		case 'docker':
			if (!d.app_name) return null;
			return {
				key: d.key!,
				app_name: d.app_name,
				...(ver && { version: ver }),
				...(vt && { version_toml: vt }),
				...(mdxPath && { version_source: mdxPath }),
				...(d.version_target && { version_target: d.version_target }),
				...(d.source_path && { source_path: d.source_path }),
				...(d.runner && { runner: d.runner }),
				...(d.image && { image: d.image }),
				...(d.e2e_name && { e2e_name: d.e2e_name }),
				...(d.deployment_yaml && {
					deployment_yaml: d.deployment_yaml,
				}),
				...(d.deployment_yamls &&
					d.deployment_yamls.length > 0 && {
						deployment_yamls: d.deployment_yamls,
					}),
				...(d.has_test !== undefined && { has_test: d.has_test }),
				...(d.target && { target: d.target }),
				...(d.nx_project && { nx_project: d.nx_project }),
				...(d.external_publish && {
					external_publish: d.external_publish,
				}),
			};
		case 'npm': {
			if (!d.package_name) return null;
			const npmVs = d.version_source || mdxPath;
			const npmVtgt =
				d.version_target ||
				`packages/npm/${d.package_name}/package.json`;
			return {
				key: d.key!,
				package_name: d.package_name,
				...(ver && { version: ver }),
				...(vt && { version_toml: vt }),
				...(npmVs && { version_source: npmVs }),
				version_target: npmVtgt,
			};
		}
		case 'crates': {
			if (!d.package_name) return null;
			const vs = d.version_source || mdxPath;
			const vtgt =
				d.version_target ||
				(d.source_path
					? `${d.source_path.replace(/\/+$/, '')}/Cargo.toml`
					: `packages/rust/${d.package_name}/Cargo.toml`);
			return {
				key: d.key!,
				package_name: d.package_name,
				...(ver && { version: ver }),
				...(vt && { version_toml: vt }),
				...(vs && { version_source: vs }),
				version_target: vtgt,
			};
		}
		case 'python': {
			if (!d.package_name || !d.pypi_name) return null;
			const pyVs = d.version_source || mdxPath;
			const pyVtgt =
				d.version_target ||
				`packages/python/${d.pypi_name}/pyproject.toml`;
			return {
				key: d.key!,
				package_name: d.package_name,
				pypi_name: d.pypi_name,
				...(ver && { version: ver }),
				...(vt && { version_toml: vt }),
				...(pyVs && { version_source: pyVs }),
				version_target: pyVtgt,
			};
		}
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
			if (d.supported_platforms?.length)
				ue.supported_platforms = d.supported_platforms;
			if (ver) ue.version = ver;
			if (vt) ue.version_toml = vt;
			const ueVs = d.version_source || mdxPath;
			if (ueVs) ue.version_source = ueVs;
			return ue;
		}
		case 'ue5_server': {
			if (!d.app_name || !d.shell_path) return null;
			return {
				key: d.key!,
				app_name: d.app_name,
				shell_path: d.shell_path,
				...(ver && { version: ver }),
				...(vt && { version_toml: vt }),
			};
		}
		case 'unity':
		case 'godot':
		case 'unreal_game':
		case 'bevy_game':
		case 'vite_game': {
			if (!d.app_name || !d.engine) return null;
			const ge: GameEntryBase = {
				key: d.key!,
				app_name: d.app_name,
				engine: d.engine,
				...(d.source_path && { source_path: d.source_path }),
				...(d.shell_path && { shell_path: d.shell_path }),
				...(ver && { version: ver }),
				...(vt && { version_toml: vt }),
				...(mdxPath && { version_source: mdxPath }),
				...(d.version_target && { version_target: d.version_target }),
				...(d.runner && { runner: d.runner }),
				...(d.has_test !== undefined && { has_test: d.has_test }),
				...(d.external_publish && {
					external_publish: d.external_publish,
				}),
			};
			return ge;
		}
		default:
			return null;
	}
}

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

export function buildManifest(entries: ProjectEntry[]): DispatchManifest {
	const tracked = entries.filter(
		(entry) =>
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
		ue5_server: [],
		unity: [],
		godot: [],
		unreal_game: [],
		bevy_game: [],
		vite_game: [],
		index: {},
		summary: {},
	};

	const trackedKeys: Array<{ key: string; pipeline: string }> = [];

	for (const entry of tracked) {
		const d = entry.data as ICiProject;
		if (!d.key || !d.pipeline) continue;

		const mdxPath = `${MDX_BASE}/${entry.id}.mdx`;
		const me = toManifestEntry(d, mdxPath);
		if (!me) continue;

		const pipeline = d.pipeline as keyof Pick<
			DispatchManifest,
			| 'docker'
			| 'npm'
			| 'crates'
			| 'python'
			| 'unreal'
			| 'ue5_server'
			| 'unity'
			| 'godot'
			| 'unreal_game'
			| 'bevy_game'
			| 'vite_game'
		>;
		const arr = manifest[pipeline] as ManifestEntry[];
		const idx = arr.length;
		arr.push(me);

		trackedKeys.push({ key: d.key, pipeline: d.pipeline });

		manifest.index[d.key] = idx;
		manifest.index[entry.id] = idx;
	}

	validateKeyUniqueness(trackedKeys);

	manifest.summary = {
		...Object.fromEntries(
			DispatchPipelines.map((p) => [
				p,
				(manifest[p as keyof DispatchManifest] as ManifestEntry[])
					?.length ?? 0,
			]),
		),
		total: trackedKeys.length,
	};

	return manifest;
}
