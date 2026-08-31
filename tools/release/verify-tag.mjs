// A release tag has to agree with the manifest it claims to release.
//
// Tags are `<moon project id>@<semver>` -- axum-kbve@0.5.2 -- so a tag
// resolves to a node in the project graph with no lookup table. That is what
// replaces .github/ci-dispatch-manifest.json: the graph already knows every
// project's source directory and what kind of thing it is, so the only fact
// left for a human to state is the version.
//
// What a human cannot reliably do by hand is keep `axum-kbve@0.5.2` in step
// with `version = "0.5.2"`. A tag that disagrees ships an artifact labelled
// with a version its own manifest never claimed, and nothing downstream can
// tell. That is the whole job of this script.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

export class TagError extends Error {}

/** Splits on the LAST @, so a scoped name like @kbve/astro@1.0.0 still parses. */
export function parseTag(tag) {
	const at = tag.lastIndexOf('@');
	if (at <= 0 || at === tag.length - 1) {
		throw new TagError(
			`"${tag}" is not a release tag. Expected <project>@<version>, e.g. axum-kbve@0.5.2.`,
		);
	}
	return { project: tag.slice(0, at), version: tag.slice(at + 1) };
}

/**
 * Reads the version out of a Cargo manifest.
 *
 * Deliberately not a TOML parser: the only line that matters is `version` in
 * the [package] table, and a dependency further down the file may carry a
 * version of its own. Stopping at the next table header is what keeps those
 * apart.
 */
export function cargoVersion(text) {
	let inPackage = false;
	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (trimmed.startsWith('[')) {
			inPackage = trimmed === '[package]';
			continue;
		}
		if (!inPackage) continue;
		const match = trimmed.match(/^version\s*=\s*"([^"]+)"/);
		if (match) return match[1];
		if (
			/^version\s*\.\s*workspace\s*=\s*true/.test(trimmed) ||
			/^version\s*=\s*\{[^}]*workspace\s*=\s*true/.test(trimmed)
		) {
			return { inherited: true };
		}
	}
	return null;
}

/**
 * The `version = "x.y.z"` line out of a version.toml or a pyproject.
 *
 * pyproject keeps it under [project] and version.toml has no tables at all, so
 * one scan that stops at the first bare `version` outside a dependency table
 * serves both. version.toml files here are a single key and a publish flag.
 */
export function tomlVersion(text, section = null) {
	let inSection = section === null;
	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (trimmed.startsWith('[')) {
			inSection = section === null ? false : trimmed === `[${section}]`;
			continue;
		}
		if (!inSection) continue;
		const match = trimmed.match(/^version\s*=\s*"([^"]+)"/);
		if (match) return match[1];
	}
	return null;
}

/** VersionName out of an Unreal .uplugin, which is JSON with a capital key. */
export function upluginVersion(text) {
	return JSON.parse(text).VersionName ?? null;
}

/**
 * Reads the version out of a Godot project manifest.
 *
 * Scoped to [application], the section Godot writes config/version into, so a
 * `config/version` under some other section cannot be picked up instead.
 */
export function godotVersion(text) {
	let inApplication = false;
	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (trimmed.startsWith('[')) {
			inApplication = trimmed === '[application]';
			continue;
		}
		if (!inApplication) continue;
		const match = trimmed.match(/^config\/version\s*=\s*"([^"]+)"/);
		if (match) return match[1];
	}
	return null;
}

/**
 * The tag's project as the graph knows it: where its source lives and what
 * tags it carries. Callers branch on those tags -- the docker publish workflow
 * acts on a tag whose project carries 'docker' and no-ops on any other -- so
 * that deciding which release mechanism a tag belongs to is a graph lookup
 * rather than a list of project ids in a workflow.
 */
export function projectNode(project, cwd = process.cwd()) {
	const out = execFileSync('moon', ['query', 'projects', '--id', project], {
		cwd,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	});
	// `--id` is a pattern, not an exact lookup: `--id q` also returns
	// bevy_quests, and taking the first match would have checked the tag
	// against another project's manifest and passed or failed for reasons
	// nothing in the output would explain.
	const found = JSON.parse(out).projects.filter((p) => p.id === project);
	if (found.length === 0) {
		throw new TagError(
			`No moon project called "${project}". The tag must name a project id; ` +
				`run \`moon query projects\` to see them.`,
		);
	}
	return found[0];
}

/**
 * Where this project declares its version, in the order a project would carry
 * them. version.toml is last and is the answer only for the image-only
 * projects -- mc, edge, the agones and firecracker images -- which have no
 * language manifest of their own. It used to be written by CI after a publish;
 * under tags it is a human-edited declaration like any other manifest.
 */
export function manifestVersion(root, source) {
	const candidates = [
		['Cargo.toml', (t) => cargoVersion(t)],
		// A private package.json is not a version claim. herbmail-game is a
		// game published to itch that happens to be built by vite, so it has
		// `"private": true, "version": "0.0.0"` -- the npm stub convention for
		// "never published here" -- beside a version.toml that carries the real
		// one. Reading the stub would fail every correct tag.
		['package.json', (t) => (JSON.parse(t).private === true ? undefined : JSON.parse(t).version ?? null)],
		['pyproject.toml', (t) => tomlVersion(t, 'project')],
		// A Tauri app's version is in its tauri.conf.json -- it is what the
		// built application reports and what the installer is stamped with.
		// The package.json beside it is a private stub, and src-tauri/Cargo.toml
		// carries the same number; this is the one the artifact is named for.
		['src-tauri/tauri.conf.json', (t) => JSON.parse(t).version ?? null],
		['project.godot', (t) => godotVersion(t)],
		['godot/project.godot', (t) => godotVersion(t)],
		// Both shapes are in the tree: most version.toml files are a bare
		// `version` key, and the four docker base images under packages/docker
		// put it under [package]. Neither is more correct, and a file that
		// parsed as "no version" would fail a tag that was perfectly good.
		['version.toml', (t) => tomlVersion(t) ?? tomlVersion(t, 'package')],
	];

	for (const [file, read] of candidates) {
		const path = join(root, source, file);
		if (!existsSync(path)) continue;
		const version = read(readFileSync(path, 'utf8'));
		// undefined means "this file declines to answer", so try the next
		// candidate; null means "this file should have had a version and does
		// not", which is an error rather than something to fall through.
		if (version === undefined) continue;
		if (version === null) {
			throw new TagError(`${source}/${file} has no version to check the tag against.`);
		}
		if (version.inherited) {
			const wsVersion = cargoVersion(
				readFileSync(join(root, 'Cargo.toml'), 'utf8').replace(
					'[workspace.package]',
					'[package]',
				),
			);
			if (!wsVersion || wsVersion.inherited) {
				throw new TagError(
					`${source}/Cargo.toml inherits its version, but the workspace does not set one.`,
				);
			}
			return { file: `${source}/Cargo.toml`, version: wsVersion };
		}
		return { file: `${source}/${file}`, version };
	}

	throw new TagError(
		`${source} has no Cargo.toml, package.json, pyproject.toml, project.godot ` +
			`or version.toml, so there is no version to check the tag against.`,
	);
}

/**
 * The docker publish task and the image it writes, read off the graph.
 *
 * utils-publish-docker-image.yml needs two facts the dispatch manifest used to
 * carry by hand: which task builds the registry image, and what that image is
 * called. Both are already in the task -- the workflow runs
 * `moon run <project>:<target>-publish`, so `target` is the task id with that
 * suffix removed, and the image is the `-t` argument the command already
 * passes to buildx. Reading them here means the manifest is not replaced by a
 * second list somewhere else.
 *
 * A project that builds several images (mc, chisel-ubuntu-axum) has no single
 * answer, so this returns null rather than guessing at one of them; the
 * workflow says so and the human names the target.
 */
export function dockerPublish(node) {
	const tasks = Object.entries(node.tasks ?? {}).filter(([id]) => id.endsWith('-publish'));
	if (tasks.length !== 1) return null;
	const [id, task] = tasks[0];
	const command = task.script ?? [task.command, ...(task.args ?? [])].join(' ');
	const image = command.match(/-t\s+(?:ghcr\.io\/)?([A-Za-z0-9._\/-]+):/)?.[1] ?? null;
	if (!image) return null;
	return { target: id.slice(0, -'-publish'.length), image };
}

/**
 * The distribution name PyPI publishes under, which is not always the moon
 * project id -- python-kbve ships as `kbve`.
 */
export function pypiName(root, source) {
	const path = join(root, source, 'pyproject.toml');
	if (!existsSync(path)) return null;
	return readFileSync(path, 'utf8').match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1] ?? null;
}

/**
 * Which publishers a tag belongs to.
 *
 * The lane is an explicit moon tag, not an inference from the language. A
 * toolchain tag says what a project is built with; a lane tag says what
 * publishing it means, and the two come apart badly -- 26 applications here
 * are written in rust and must never reach crates.io, and five python projects
 * are internal tooling rather than PyPI distributions. Deriving the lane from
 * `rust` or `uv` routed all of them into a registry.
 *
 * So a project opts in: 'crates', 'npm', 'pypi', 'docker'. That is the same
 * convention as the workspace repo, and it means adding a project to a lane is
 * a line in its own moon.yml rather than an entry in a manifest kept somewhere
 * else. A project can be in more than one lane.
 */
export function lanes(tags) {
	const map = {
		docker: 'docker',
		npm: 'npm',
		pypi: 'python',
		crates: 'crates',
		// The engine lanes. Each is a build workflow rather than a registry
		// push, and each reads the project's ENGINE_CONFIG.
		godot: 'godot',
		unity: 'unity',
		'unreal-game': 'unreal-game',
		'ue5-server': 'ue5-server',
		// One lane for every browser game. A Vite game and a Bevy wasm game
		// differ in what their build task does, which moon already knows, and
		// in nothing the publish workflow does.
		'web-game': 'web-game',
		// The Tauri desktop apps. Named `desktop` rather than `tauri` because
		// `tauri` is already the toolchain tag that hands a project its build
		// tasks, and a lane is a different question from a toolchain.
		desktop: 'desktop',
	};
	return Object.entries(map)
		.filter(([tag]) => tags.includes(tag))
		.map(([, lane]) => lane);
}

/**
 * Where a release of this project publishes to, beyond its own registry.
 *
 * utils-external-publish.yml takes the `external_publish` blob the dispatch
 * manifest carried per entry -- itch, Steam, Modrinth, Factorio. That blob is
 * now the project's own env, so this reassembles it in the shape the workflow
 * already reads rather than changing a 890-line workflow to match a new one.
 *
 * The Factorio mods are the exception: the manifest listed them as {name,
 * source_path} pairs, and both facts are a project in the graph, so they come
 * from the `factorio-mod` lane rather than from this project's env.
 */
/**
 * A structured env value, parsed with the project and the key in the error.
 *
 * These are JSON in a string because moon env values are strings, and a bare
 * `JSON.parse` failure reads `Unexpected token } in JSON at position 41` with
 * nothing to say which of 87 projects or which of a dozen keys it came from.
 * At release time that is the only thing on the screen.
 */
function envJson(node, key) {
	const raw = node.config?.env?.[key];
	try {
		return JSON.parse(raw);
	} catch (error) {
		throw new TagError(`${node.id} has a ${key} that is not valid JSON: ${error.message}\n\n  ${raw}`);
	}
}

export function externalPublish(node, factorioMods = []) {
	const env = node.config?.env ?? {};
	const out = {};

	if (env.ITCH_USER && env.ITCH_GAME) {
		out.itch_user = env.ITCH_USER;
		out.itch_game = env.ITCH_GAME;
		if (env.ITCH_CHANNEL) out.itch_channel = env.ITCH_CHANNEL;
	}
	// Structured rather than scalar, so it is stored as JSON. A malformed value
	// throws here, where the tag is being checked, rather than midway through a
	// publish.
	if (env.STEAM_APPS) out.steam_apps = envJson(node, 'STEAM_APPS');

	for (const [key, value] of Object.entries(env)) {
		if (!key.startsWith('MODRINTH_')) continue;
		// Two of these are lists in the shape the workflow reads --
		// game_versions and loaders -- and env values are strings. Parse what
		// looks like JSON back into the value it was, and leave a plain string
		// alone: `mc.kbve.com` is not JSON and must not become one.
		out[key.toLowerCase()] =
			value.startsWith('[') || value.startsWith('{') ? envJson(node, key) : value;
	}

	if (env.PUBLISHES_FACTORIO_MODS === 'true' && factorioMods.length)
		out.factorio_mods = factorioMods;

	return Object.keys(out).length ? out : null;
}

/**
 * A Factorio mod's own name: info.json for one authored as mod source, the
 * pyproject name for the two that are built by a python project.
 */
export function modName(source, root = process.cwd()) {
	const info = join(root, source, 'info.json');
	if (existsSync(info)) return JSON.parse(readFileSync(info, 'utf8')).name ?? null;
	const py = join(root, source, 'pyproject.toml');
	if (existsSync(py)) return readFileSync(py, 'utf8').match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1] ?? null;
	return null;
}

/**
 * The engine blob a game build workflow reads, in the shape it already expects.
 *
 * ENGINE_CONFIG is the manifest's `engine` block verbatim. Three things the
 * dispatcher merged in are merged here instead of being stored: `app_name` is
 * the project id, `shell_path` is its own env key, and the three list fields
 * are defaulted so the workflow's `fromJSON(...).maps` is never undefined.
 * Storing app_name would be a second copy of the project id that could drift
 * from it.
 */
export function engineConfig(node) {
	const raw = node.config?.env?.ENGINE_CONFIG;
	if (!raw) return '';
	const engine = envJson(node, 'ENGINE_CONFIG');
	return JSON.stringify({
		...engine,
		app_name: node.id,
		shell_path: node.config?.env?.UE_SHELL_PATH ?? '',
		build_targets: engine.build_targets ?? [],
		maps: engine.maps ?? [],
		features: engine.features ?? [],
	});
}

/**
 * The publish blob those same workflows read. Built from the same env the
 * external publish lane uses, so a project states where it ships once.
 */
export function publishConfig(node) {
	const env = node.config?.env ?? {};
	return JSON.stringify({
		deploy_to_itch: Boolean(env.ITCH_USER && env.ITCH_GAME),
		itch_user: env.ITCH_USER ?? '',
		itch_game: env.ITCH_GAME ?? '',
		itch_channel: env.ITCH_CHANNEL ?? '',
		notarize: env.NOTARIZE === 'true',
	});
}

export function verify(tag, root = process.cwd(), factorioMods = [], node = null) {
	const { project, version } = parseTag(tag);
	// The node is normally looked up here, one `moon query` per call, which is
	// right for a release: it verifies one tag. audit.mjs verifies all of them,
	// and `moon query projects` already returned every node it needs, so it
	// passes one in rather than spawning moon 87 more times.
	node ??= projectNode(project, root);
	if (node.id !== project) {
		throw new TagError(`Tag ${tag} was checked against project ${node.id}.`);
	}
	const source = node.source;
	const manifest = manifestVersion(root, source);
	if (manifest.version !== version) {
		throw new TagError(
			`Tag ${tag} claims version ${version}, but ${manifest.file} says ` +
				`${manifest.version}.\n\nEither the version bump was not committed ` +
				`before tagging, or the tag has a typo. Delete the tag, fix it, and ` +
				`tag again -- do not move a tag that has already been released.`,
		);
	}
	const tags = node.config?.tags ?? [];
	return {
		project,
		version,
		source,
		file: manifest.file,
		tags,
		// Only meaningful for the lane that asks for them. A crate release has
		// no image and a docker release has no PyPI name, and the workflow
		// picks its lane from `tags` before it reads either.
		lanes: lanes(tags),
		// Whether the release gate has an end-to-end suite to run on top of
		// `test`. Only one of the 26 crates has one, so asking for it
		// unconditionally would fail every other release on a task that was
		// never meant to exist.
		hasE2e: Boolean(node.tasks?.e2e),
		hasTest: Boolean(node.tasks?.test),
		docker: tags.includes('docker') ? dockerPublish(node) : null,
		pypi: tags.includes('pypi') ? pypiName(root, source) : null,
		external: externalPublish(node, factorioMods),
		// The kube manifests a release pins its image tag into. Publishing an
		// image does not change what the cluster runs, so this is the step that
		// makes a docker release actually reach it.
		deploymentYamls: node.config?.env?.KUBE_DEPLOYMENT_YAMLS ?? '',
		// Which runner this project's release builds on. The default hosted
		// runner is two cores with a 60 minute ceiling, and several of these
		// are compiles that do not fit in it -- tocloud9-gameserver is an
		// AzerothCore build that was cancelled at that limit before the
		// manifest started carrying this.
		runner: node.config?.env?.CI_RUNNER ?? 'ubuntu-latest',
		// The engine build configuration, passed through to the build workflow
		// in the shape it already reads. Empty for anything that is not a game.
		engine: engineConfig(node),
		publish: publishConfig(node),
		shellPath: node.config?.env?.UE_SHELL_PATH ?? '',
		// What a Tauri build of this app produces, for the desktop lane.
		tauriPlatforms: node.config?.env?.TAURI_PLATFORMS ?? '',
		tauriNotarize: node.config?.env?.TAURI_NOTARIZE === 'true',
		webGameNeedsRust: node.config?.env?.WEB_GAME_NEEDS_RUST === 'true',
	};
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
	const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
	if (!tag) {
		console.error('Usage: node tools/release/verify-tag.mjs <project>@<version>');
		process.exit(2);
	}
	try {
		// The Factorio mods, in the {name, source_path} shape
		// utils-external-publish.yml reads. Queried once and passed in, so
		// verify() itself stays a pure function of the graph node.
		const mods = JSON.parse(
			execFileSync('moon', ['query', 'projects', '--tags', 'factorio-mod'], {
				encoding: 'utf8',
				maxBuffer: 64 * 1024 * 1024,
			}),
		).projects.map((p) => ({
			// The mod's own name, which is not the moon project id: the mod at
			// mods-local is the project `factorio-mod-kbve` and the mod `kbve`.
			name: modName(p.source) ?? p.id,
			source_path: p.source,
		}));
		const result = verify(tag, process.cwd(), mods);
		console.log(
			`${tag} matches ${result.file} (project ${result.project} at ${result.source}).`,
		);
		// Handing the resolved project back to the workflow keeps every release
		// workflow free of project names: one asks the graph what the tag means,
		// then decides from the tags it carries.
		if (process.env.GITHUB_OUTPUT) {
			appendFileSync(
				process.env.GITHUB_OUTPUT,
				[
					`project=${result.project}`,
					`version=${result.version}`,
					`source=${result.source}`,
					`file=${result.file}`,
					`tags=${JSON.stringify(result.tags)}`,
					`lanes=${JSON.stringify(result.lanes)}`,
					`has_e2e=${result.hasE2e}`,
					`has_test=${result.hasTest}`,
					`docker_target=${result.docker?.target ?? ''}`,
					`docker_image=${result.docker?.image ?? ''}`,
					`pypi_name=${result.pypi ?? ''}`,
					`external_publish=${result.external ? JSON.stringify(result.external) : ''}`,
					`deployment_yamls=${result.deploymentYamls}`,
					`runner=${result.runner}`,
					`engine=${result.engine}`,
					`publish=${result.publish}`,
					`shell_path=${result.shellPath}`,
					`tauri_platforms=${result.tauriPlatforms}`,
					`tauri_notarize=${result.tauriNotarize}`,
					`web_game_needs_rust=${result.webGameNeedsRust}`,
					// The queue guard in each build workflow checks this is less
					// than two hours old. It was the dispatch timestamp; for a
					// tag it is when the release started.
					`dispatched_at=${Math.floor(Date.now() / 1000)}`,
					'',
				].join('\n'),
			);
		}
	} catch (error) {
		if (error instanceof TagError) {
			console.error(`::error::${error.message}`);
			process.exit(1);
		}
		throw error;
	}
}
