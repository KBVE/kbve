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
		['package.json', (t) => JSON.parse(t).version ?? null],
		['pyproject.toml', (t) => tomlVersion(t, 'project')],
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
	const map = { docker: 'docker', npm: 'npm', pypi: 'python', crates: 'crates' };
	return Object.entries(map)
		.filter(([tag]) => tags.includes(tag))
		.map(([, lane]) => lane);
}

export function verify(tag, root = process.cwd()) {
	const { project, version } = parseTag(tag);
	const node = projectNode(project, root);
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
		docker: tags.includes('docker') ? dockerPublish(node) : null,
		pypi: tags.includes('uv') ? pypiName(root, source) : null,
	};
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
	const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
	if (!tag) {
		console.error('Usage: node tools/release/verify-tag.mjs <project>@<version>');
		process.exit(2);
	}
	try {
		const result = verify(tag);
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
					`docker_target=${result.docker?.target ?? ''}`,
					`docker_image=${result.docker?.image ?? ''}`,
					`pypi_name=${result.pypi ?? ''}`,
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
