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
	return tags;
}

// A target whose commands only invoke Nx is an alias for other targets. It
// becomes a deps-only task: keeping the command would leave moon shelling out
// to the runner it replaces.
const NX_CALL =
	/^\s*(?:npx |pnpm |pnpm exec )?nx (?:run )?([a-zA-Z0-9_.@/-]+):([a-zA-Z0-9_:.-]+)|^\s*(?:npx |pnpm |pnpm exec )?nx ([a-z-]+) ([a-zA-Z0-9_.@/-]+)/;

function asNxDeps(raw, self) {
	const deps = [];
	for (const cmd of raw) {
		for (const part of cmd.split(/&&|;/)) {
			const t = part.trim();
			if (!t) continue;
			const m = t.match(NX_CALL);
			if (!m) return null; // something other than an nx call: keep the script
			const [proj, task] = m[1] ? [m[1], m[2]] : [m[4], m[3]];
			deps.push(proj === self ? '~:' + taskId(task) : `${proj}:${taskId(task)}`);
		}
	}
	return deps.length ? [...new Set(deps)] : null;
}

const token = (s, dir) =>
	s
		.replaceAll('{workspaceRoot}/', '/')
		.replaceAll('{workspaceRoot}', '/')
		.replaceAll('{projectRoot}/', '')
		.replaceAll('{projectRoot}', '.')
		.replace(new RegExp('^/' + dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/'), '');

const dep = (d, dir) => {
	if (typeof d === 'string') {
		if (d.startsWith('^')) return '^:' + d.slice(1);
		return d.includes(':') ? d.replace(/:(.+)$/, (m, t) => ':' + taskId(t)) : '~:' + taskId(d);
	}
	const target = taskId(d.target ?? '');
	const projects = d.projects;
	if (!projects || projects === 'self') return '~:' + target;
	if (projects === 'dependencies') return '^:' + target;
	const list = Array.isArray(projects) ? projects : [projects];
	return list.map((p) => `${p}:${target}`);
};

export function convert(dir, tags) {
	const nx = JSON.parse(readFileSync(path.join(dir, 'project.json'), 'utf8'));
	const provided = new Set(tags.flatMap((t) => PRESET_TASKS[t] ?? []));
	const tasks = {};

	for (const [name, target] of Object.entries(nx.targets ?? {})) {
		const id = taskId(name);
		const o = target.options ?? {};
		const raw = o.command ? [o.command] : (o.commands ?? []).map((c) => (typeof c === 'string' ? c : c.command));
		if (!raw.length) continue; // executor-driven; a preset covers it or it is ported by hand

		// Nx runs `commands` in parallel unless told otherwise, but every
		// multi-command target in this repo that matters sets parallel: false.
		// Joining with && preserves the sequential case and makes the parallel
		// one sequential too, which is safe in the direction that matters.
		const script = raw.join(' && ');

		// `nx run a:b` inside a target is an alias, not work of its own.
		const aliased = asNxDeps(raw, nx.name);
		if (aliased) {
			tasks[id] = { deps: aliased, options: { cache: false } };
			continue;
		}

		const cwd = o.cwd ?? '';
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
		if (target.dependsOn?.length) task.deps = target.dependsOn.flatMap((d) => dep(d, dir));
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
