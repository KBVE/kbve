// Translates an Nx project.json into a moon.yml.
//
// Temporary: this exists to carry 149 projects across without hand-writing
// each one, and it is deleted with the rest of the Nx surface once nothing
// reads project.json. It is committed rather than run once and thrown away so
// the translation is reviewable, and so it can be re-run when a project.json
// changes while both runners are live.
//
// Emits nothing for a target an inherited preset already provides, unless the
// project's own definition differs from it -- the point is that a generated
// moon.yml holds only what the tags do not.
//
// Usage: node tools/moon/from-nx.mjs <project-dir>...   (writes <dir>/moon.yml)
//        node tools/moon/from-nx.mjs --print <project-dir>
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// Task ids moon gets from a tag or toolchain file. A project only writes one
// of these when its command differs from the preset's.
const PRESET_TASKS = {
	rust: ['build', 'test', 'lint', 'format', 'run'],
	crate: ['dry'],
	bevy: ['check-wasm', 'check-desktop'],
	docker: ['container'],
	astro: ['build', 'dev', 'preview', 'check', 'sync'],
	vite: ['build', 'preview'],
	vitest: ['test', 'coverage'],
	playwright: ['e2e'],
	uv: ['install', 'lock', 'test', 'lint', 'format', 'build'],
	npm: ['build', 'pack', 'publish'],
	eslint: ['lint'],
	tauri: ['dev', 'dev-web', 'build', 'test-rust', 'build-tauri'],
	lfs: ['assets', 'build'],
};

// ':' separates project from task in moon, so a target name cannot hold one.
export const taskId = (name) => name.replace(/:/g, '-');

// Tags come from what is on disk rather than a list, so re-running this after a
// project grows a Dockerfile or a vitest config picks it up.
export function detectTags(dir) {
	const has = (f) => existsSync(path.join(dir, f));
	const glob = (re) => {
		try {
			return readdirSync(dir).some((f) => re.test(f));
		} catch {
			return false;
		}
	};
	const tags = [];
	if (has('Cargo.toml')) tags.push('rust');
	if (has('pyproject.toml')) tags.push('uv');
	if (glob(/^Dockerfile/)) tags.push('docker');
	if (glob(/^astro\.config\./)) tags.push('astro');
	if (glob(/^playwright.*\.config\./)) tags.push('playwright');
	if (glob(/^vite\.config\./)) tags.push('vite');
	if (glob(/^vitest.*\.config\./)) tags.push('vitest');
	if (glob(/^eslint\.config\./)) tags.push('eslint');

	// A rust service with a vitest config runs vitest over a live container, not
	// over its own sources: `test` is cargo's and the suite is the `e2e` target,
	// which project.json spells out. Both tags define `test`, so keeping vitest
	// here would leave which one wins to inheritance order.
	if (tags.includes('rust') && tags.includes('vitest')) {
		return tags.filter((t) => t !== 'vitest');
	}

	// Same collision on `lint`: clippy's and ruff's, not eslint's.
	if (tags.includes('eslint') && (tags.includes('rust') || tags.includes('uv'))) {
		return tags.filter((t) => t !== 'eslint');
	}
	return tags;
}

// A target whose commands only invoke Nx is an alias for other targets. It
// becomes a deps-only task: keeping the command would leave moon shelling out
// to the runner it replaces.
const NX_CALL =
	/^\s*(?:[A-Z_][A-Z0-9_]*=\S* )*(?:npx |pnpm |pnpm exec |\.\/kbve\.sh -)?nx (?:run )?([a-zA-Z0-9_.@/-]+):([a-zA-Z0-9_:.-]+)$|^\s*(?:[A-Z_][A-Z0-9_]*=\S* )*(?:npx |pnpm |pnpm exec |\.\/kbve\.sh -)?nx ([a-z][a-z0-9_:.-]*) ([a-zA-Z0-9_.@/-]+)$/;

// Splits a target's commands into the runner calls it makes and the work it
// does itself. A call to the runner is a dependency, not a command: leaving it
// in the script would have moon shell out to the tool it replaces, and the
// two graphs would then both believe they own the ordering.
//
// A target that is nothing but runner calls is an alias, and becomes deps-only.
// A mixed one -- `nx astro-kbve:build && cargo run` is the common shape here --
// keeps its own half as the script and hoists the rest into deps.
//
// Only a leading run of them is hoisted. deps have no order between them, so a
// call that comes after work of the project's own would lose the ordering the
// `&&` gave it -- `nx a:e2e && free the port && nx a:e2e-mock` would race. Those
// keep the runner call in the script, where it is visible and has to be ported
// by hand.
function hoistNxDeps(raw, self) {
	const deps = [];
	const rest = [];
	for (const cmd of raw) {
		for (const part of cmd.split(/&&/)) {
			const t = part.trim();
			if (!t) continue;
			const m = rest.length ? null : t.match(NX_CALL);
			if (!m) {
				rest.push(t);
				continue;
			}
			const [proj, task] = m[1] ? [m[1], m[2]] : [m[4], m[3]];
			// Checked against the Nx target name, before the colons in it become
			// hyphens: `e2e:docker` is a target, `e2e-docker` is what moon calls it.
			const targets = proj === self ? null : targetsOf(proj);
			if (targets && !targets.has(task)) continue;
			deps.push(proj === self ? '~:' + taskId(task) : `${proj}:${taskId(task)}`);
		}
	}
	return { deps: [...new Set(deps)], rest };
}

const token = (s, dir) =>
	s
		.replaceAll('{workspaceRoot}/', '/')
		.replaceAll('{workspaceRoot}', '/')
		.replaceAll('{projectRoot}/', '')
		.replaceAll('{projectRoot}', '.')
		.replace(new RegExp('^/' + dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/'), '');

// `own` is the project's own target names. Nx allows a colon inside one, so
// `solitaire:snapshot-npcdb` is a single target here rather than a reference to
// a `solitaire` project -- and this repo has 120 of them. A dependency has to be
// read against that set before it can be read as project:task.
const dep = (d, dir, self, own = new Set()) => {
	if (typeof d === 'string') {
		if (d.startsWith('^')) return '^:' + d.slice(1);
		if (own.has(d)) return '~:' + taskId(d);
		if (!d.includes(':')) return '~:' + taskId(d);
		const [proj, ...rest] = d.split(':');
		const task = taskId(rest.join(':'));
		return proj === self ? '~:' + task : `${proj}:${task}`;
	}
	const target = taskId(d.target ?? '');
	const projects = d.projects;
	if (!projects || projects === 'self') return '~:' + target;
	if (projects === 'dependencies') return '^:' + target;
	const list = Array.isArray(projects) ? projects : [projects];
	return list.map((p) => (p === self ? '~:' + target : `${p}:${target}`));
};

// Every project.json in the repository, by Nx project name. Used to check that
// a dependency points at a target that exists: `cryptothrone:base` and
// `discordsh:base` forward to a `base` target neither axum project has, so they
// are dead under Nx too and should not be carried across.
let PROJECTS;
function targetsOf(name) {
	if (!PROJECTS) {
		PROJECTS = new Map();
		const walk = (d) => {
			for (const entry of readdirSync(d, { withFileTypes: true })) {
				if (entry.name.startsWith('.') || ['node_modules', 'target', 'dist'].includes(entry.name)) continue;
				const full = path.join(d, entry.name);
				if (entry.isDirectory()) walk(full);
				else if (entry.name === 'project.json') {
					try {
						const nx = JSON.parse(readFileSync(full, 'utf8'));
						if (nx.name) PROJECTS.set(nx.name, new Set(Object.keys(nx.targets ?? {})));
					} catch {}
				}
			}
		};
		walk('.');
	}
	return PROJECTS.get(name);
}

// A dep is dropped when the project it names is known and has no such target.
// An unknown project is left alone: it may be one moon defines without an Nx
// counterpart, and dropping it would hide a real edge.
function live(d, self, own) {
	if (typeof d !== 'string' || d.startsWith('^') || own.has(d)) return true;
	const [proj, ...rest] = d.split(':');
	if (!rest.length || proj === self) return true;
	const targets = targetsOf(proj);
	return !targets || targets.has(rest.join(':'));
}

// @nx-tools/nx-container:build in terms of the CLI it wraps.
//
// Two tasks come out of one target. The `local` configuration loads the image
// into the daemon and is what anyone runs at a terminal; `production` pushes it
// to a registry through a build cache and is only ever run by CI. They differ by
// more than a flag -- different tags, sometimes different build args -- so they
// cannot be one task with a switch, and moon has no notion of a configuration to
// hang the difference on.
function containerScript(target, project, config) {
	const o = { ...(target.options ?? {}), ...(target.configurations?.[config] ?? {}) };
	const meta = o.metadata ?? {};
	const tags =
		o.tags ??
		(meta.images ?? []).flatMap((image) => (meta.tags ?? ['latest']).map((t) => `${image}:${t}`));
	const args = ['docker', 'buildx', 'build'];
	// --push and --load are alternatives: one uploads the image, the other keeps
	// it local. A production config that sets both means push.
	args.push(o.push ? '--push' : '--load');
	if (o.target) args.push('--target', o.target);
	if (o.platforms?.length) args.push('--platform', o.platforms.join(','));
	for (const a of o['build-args'] ?? []) args.push('--build-arg', a);
	for (const c of o['cache-from'] ?? []) args.push(`--cache-from=${c}`);
	for (const c of o['cache-to'] ?? []) args.push(`--cache-to=${c}`);
	if (o.provenance !== undefined) args.push(`--provenance=${o.provenance}`);
	if (o.sbom !== undefined) args.push(`--sbom=${o.sbom}`);
	args.push('-f', o.file);
	for (const t of tags.length ? tags : [`kbve/${project}:latest`]) args.push('-t', t);
	args.push(o.context ?? '.');
	return args.join(' ');
}

export function convert(dir, tags) {
	const nx = JSON.parse(readFileSync(path.join(dir, 'project.json'), 'utf8'));
	const provided = new Set(tags.flatMap((t) => PRESET_TASKS[t] ?? []));
	const own = new Set(Object.keys(nx.targets ?? {}));
	const tasks = {};

	for (const [name, target] of Object.entries(nx.targets ?? {})) {
		const id = taskId(name);
		const o = target.options ?? {};
		const raw = o.command ? [o.command] : (o.commands ?? []).map((c) => (typeof c === 'string' ? c : c.command));
		if (!raw.length) {
			// The one executor with a mechanical translation. Everything else
			// executor-driven is either covered by a preset or ported by hand.
			if (target.executor === '@nx-tools/nx-container:build') {
				const opts = { runFromWorkspaceRoot: true, cache: false };
				// The docker tag already provides `container` for the common
				// shape, so only a project whose local build differs writes it.
				if (!provided.has(id)) {
					tasks[id] = { script: containerScript(target, nx.name, 'local'), options: opts };
				}
				if (target.configurations?.production) {
					tasks[`${id}-publish`] = {
						script: containerScript(target, nx.name, 'production'),
						options: { ...opts, runInCI: true },
					};
				}
			}
			continue;
		}

		// Nx runs `commands` in parallel unless told otherwise, but every
		// multi-command target in this repo that matters sets parallel: false.
		// Joining with && preserves the sequential case and makes the parallel
		// one sequential too, which is safe in the direction that matters.
		const hoisted = hoistNxDeps(raw, nx.name);
		if (!hoisted.deps.length && !hoisted.rest.length) continue; // every call it made was dead
		if (hoisted.deps.length && !hoisted.rest.length) {
			tasks[id] = { deps: hoisted.deps, options: { cache: false } };
			continue;
		}
		// `nx exec -- x` is how a target reaches a local binary through the
		// runner's PATH. moon puts the toolchain on PATH itself, so the prefix
		// carries no meaning here and only leaves a dead reference behind.
		const script = hoisted.rest.join(' && ').replaceAll(/(?:npx |pnpm |pnpm exec )?nx exec -- /g, '');

		// A cwd is written in Nx tokens as often as it is written literally, and
		// `{projectRoot}/dbmate` has to resolve before it can be made relative.
		const cwd = (o.cwd ?? '').replaceAll('{workspaceRoot}/', '').replaceAll('{projectRoot}', dir);
		const atRoot = cwd === '' || cwd === '{workspaceRoot}' || cwd === '.';
		const inProject = cwd === dir;

		const task = { script };
		if (atRoot && !inProject) task.options = { runFromWorkspaceRoot: true };
		else if (!inProject && cwd) {
			// A cwd that is neither the workspace root nor the project root, e.g.
			// a src-tauri/ or a sibling tool directory.
			task.script = `cd ${path.relative(dir, cwd) || '.'} && ${script}`;
		}

		if (target.outputs?.length) task.outputs = target.outputs.map((x) => token(x, dir));
		if (target.inputs?.length) {
			const ins = target.inputs.filter((i) => typeof i === 'string').map((x) => token(x, dir));
			if (ins.length) task.inputs = ins;
		}
		const declared = (target.dependsOn ?? [])
			.filter((d) => live(d, nx.name, own))
			.flatMap((d) => dep(d, dir, nx.name, own));
		const alldeps = [...new Set([...hoisted.deps, ...declared])];
		if (alldeps.length) task.deps = alldeps;
		if (target.cache === false) task.options = { ...(task.options ?? {}), cache: false };

		// A preset already defines this id. Keep the project's version only when
		// it actually says something different.
		if (provided.has(id) && !task.outputs && !task.deps && !target.cache) {
			const presetish = /^(cargo|astro|vite|vitest|playwright|uv) /.test(script);
			if (presetish) continue;
		}
		tasks[id] = task;
	}
	return { nx, tasks };
}

const yaml = (dir, tags, nx, tasks) => {
	const lines = ["$schema: 'https://moonrepo.dev/schemas/project.json'", ''];
	lines.push(`layer: '${nx.projectType === 'library' ? 'library' : 'application'}'`);
	const lang = tags.includes('rust') ? 'rust' : tags.includes('uv') ? 'python' : 'typescript';
	lines.push(`language: '${lang}'`);
	if (tags.length) lines.push(`tags: [${tags.map((t) => `'${t}'`).join(', ')}]`);
	if (Object.keys(tasks).length) {
		lines.push('', 'tasks:');
		for (const [id, t] of Object.entries(tasks)) {
			lines.push(`  ${id}:`);
			if (t.script) lines.push(`    script: ${JSON.stringify(t.script)}`);
			if (t.deps) lines.push(`    deps: [${t.deps.map((d) => `'${d}'`).join(', ')}]`);
			if (t.inputs) lines.push(`    inputs: [${t.inputs.map((d) => `'${d}'`).join(', ')}]`);
			if (t.outputs) lines.push(`    outputs: [${t.outputs.map((d) => `'${d}'`).join(', ')}]`);
			if (t.options) {
				lines.push('    options:');
				for (const [k, v] of Object.entries(t.options)) lines.push(`      ${k}: ${v}`);
			}
		}
	}
	return lines.join('\n') + '\n';
};

const args = process.argv.slice(2);
const print = args[0] === '--print';
for (const dir of print ? args.slice(1) : args) {
	const tags = detectTags(dir);
	const { nx, tasks } = convert(dir, tags);
	const out = yaml(dir, tags, nx, tasks);
	if (print) console.log(`# ${dir}\n${out}`);
	else writeFileSync(path.join(dir, 'moon.yml'), out);
}
