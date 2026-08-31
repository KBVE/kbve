import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTag, cargoVersion, tomlVersion, godotVersion, TagError } from './verify-tag.mjs';

test('parseTag splits on the last @, so scoped names survive', () => {
	assert.deepEqual(parseTag('axum-kbve@0.5.2'), { project: 'axum-kbve', version: '0.5.2' });
	assert.deepEqual(parseTag('@kbve/astro@1.2.3'), { project: '@kbve/astro', version: '1.2.3' });
});

test('parseTag rejects anything that is not <project>@<version>', () => {
	for (const bad of ['axum-kbve', '@1.0.0', 'axum-kbve@', '']) {
		assert.throws(() => parseTag(bad), TagError, bad);
	}
});

test('cargoVersion reads [package] and not a dependency version', () => {
	const text = `[package]\nname = "q"\nversion = "0.1.7"\n\n[dependencies]\nserde = { version = "1.0.0" }\n`;
	assert.equal(cargoVersion(text), '0.1.7');
});

test('cargoVersion reports an inherited workspace version rather than a value', () => {
	assert.deepEqual(cargoVersion('[package]\nversion.workspace = true\n'), { inherited: true });
	assert.deepEqual(cargoVersion('[package]\nversion = { workspace = true }\n'), {
		inherited: true,
	});
});

test('cargoVersion ignores a version that is only in a dependency table', () => {
	assert.equal(cargoVersion('[dependencies]\nserde = "1.0"\nversion = "9.9.9"\n'), null);
});

test('tomlVersion reads both version.toml shapes', () => {
	assert.equal(tomlVersion('version = "1.0.67"\npublish = true\n'), '1.0.67');
	assert.equal(tomlVersion('[package]\nversion = "24.04.11"\n', 'package'), '24.04.11');
});

test('tomlVersion scoped to a section ignores the same key elsewhere', () => {
	const text = '[tool.other]\nversion = "9.9.9"\n\n[project]\nversion = "2.0.0"\n';
	assert.equal(tomlVersion(text, 'project'), '2.0.0');
});

test('godotVersion reads config/version only under [application]', () => {
	const text = '[rendering]\nconfig/version="9.9.9"\n\n[application]\nconfig/version="1.4.0"\n';
	assert.equal(godotVersion(text), '1.4.0');
});

import { imagesFrom } from './docker-images.mjs';

test('imagesFrom reads every image a docker project publishes', () => {
	const projects = [
		{
			config: { tags: ['docker'] },
			tasks: {
				container: { script: 'docker buildx build -t kbve/skipped:latest .' },
				'container-publish': {
					script: 'docker buildx build -t ghcr.io/kbve/thing:latest -t kbve/thing:latest .',
				},
			},
		},
		{
			config: { tags: ['docker'] },
			tasks: {
				'containerx-builder-publish': { script: 'docker buildx build -t kbve/two-builder:latest .' },
				'containerx-runtime-publish': { script: 'docker buildx build -t kbve/two:latest .' },
			},
		},
		{ config: { tags: ['rust'] }, tasks: { 'container-publish': { script: '-t kbve/not-docker:latest' } } },
	];
	assert.deepEqual(imagesFrom(projects), ['thing', 'two', 'two-builder']);
});

test('imagesFrom ignores projects with no publish task', () => {
	assert.deepEqual(imagesFrom([{ config: { tags: ['docker'] }, tasks: { container: { script: '-t kbve/x:latest' } } }]), []);
});

import { matrixFrom } from './godot-matrix.mjs';

const GODOT_PROJECTS = [
	{
		id: 'godot-friendslop',
		source: 'apps/friendslop/godot-friendslop',
		config: {
			tags: ['godot'],
			env: {
				ENGINE_CONFIG: JSON.stringify({
					version: '4.7.1',
					features: ['net-godot'],
					gdextension: { package: 'q', addon_path: 'addons/q' },
				}),
			},
		},
		dependencies: [{ id: 'q', scope: 'production' }],
	},
	{ id: 'q', source: 'crates/q', config: {}, dependencies: [] },
];

test('matrixFrom picks Godot projects by their declared engine version', () => {
	const matrix = matrixFrom(GODOT_PROJECTS, null);
	assert.equal(matrix.length, 1);
	assert.deepEqual(matrix[0], {
		app_name: 'godot-friendslop',
		project_path: 'apps/friendslop/godot-friendslop',
		godot_version: '4.7.1',
		package: 'q',
		addon_path: 'addons/q',
		features: 'net-godot',
	});
});

test('matrixFrom narrows to the affected set when one is given', () => {
	assert.deepEqual(matrixFrom(GODOT_PROJECTS, []), []);
	assert.equal(matrixFrom(GODOT_PROJECTS, ['godot-friendslop']).length, 1);
	// The crate alone is not a Godot project; it reaches the matrix only by
	// being a dependency of one, which the affected query resolves upstream.
	assert.deepEqual(matrixFrom(GODOT_PROJECTS, ['q']), []);
});

test('matrixFrom leaves package empty for a Godot project with no rust dependency', () => {
	const bare = [
		{ id: 'g', source: 'a/g', config: { tags: ['godot'], env: { ENGINE_CONFIG: '{"version":"4.7.1"}' } } },
	];
	assert.equal(matrixFrom(bare, null)[0].package, '');
});

import { matrixFrom as unrealMatrix, orderedDeps } from './unreal-matrix.mjs';

const PLUGINS = [
	{ id: 'A', source: 'p/A', config: { env: { UE_SUPPORTED_PLATFORMS: 'Linux' } }, dependencies: [] },
	{ id: 'B', source: 'p/B', config: { env: { UE_SUPPORTED_PLATFORMS: 'Linux,Win64,Mac' } }, dependencies: [{ id: 'A' }] },
	{ id: 'C', source: 'p/C', config: { env: { UE_SUPPORTED_PLATFORMS: 'Mac' } }, dependencies: [{ id: 'B' }] },
];

test('orderedDeps lists dependencies deepest first, transitively', () => {
	const deps = new Map([['A', []], ['B', ['A']], ['C', ['B']]]);
	assert.deepEqual(orderedDeps('C', deps), ['A', 'B']);
	assert.deepEqual(orderedDeps('A', deps), []);
});

test('orderedDeps yields a diamond once and survives a cycle', () => {
	const diamond = new Map([['top', ['l', 'r']], ['l', ['base']], ['r', ['base']], ['base', []]]);
	assert.deepEqual(orderedDeps('top', diamond), ['base', 'l', 'r']);
	// A cycle terminates rather than recursing forever. It also lists the
	// starting node, which a well-formed graph never does -- the point of the
	// assertion is that it returns at all, since Unreal would reject the cycle
	// long before the ordering mattered.
	const cyclic = new Map([['x', ['y']], ['y', ['x']]]);
	assert.ok(orderedDeps('x', cyclic).includes('y'));
});

test('unreal matrix splits by declared platform', () => {
	const lanes = unrealMatrix(PLUGINS, null, 'tag');
	assert.deepEqual(lanes.Linux.map((e) => e.key), ['A', 'B']);
	assert.deepEqual(lanes.Mac.map((e) => e.key), ['B', 'C']);
	assert.deepEqual(lanes.Win64.map((e) => e.key), ['B']);
});

test('unreal matrix emits dependency paths in build order', () => {
	const lanes = unrealMatrix(PLUGINS, null, 'tag');
	assert.equal(lanes.Mac.find((e) => e.key === 'C').dependency_plugins, 'p/A p/B');
});

test('unreal matrix narrows to the selected set', () => {
	assert.deepEqual(unrealMatrix(PLUGINS, new Set(['C']), 't').Mac.map((e) => e.key), ['C']);
	assert.deepEqual(unrealMatrix(PLUGINS, new Set(), 't').Linux, []);
});

import { execFileSync } from 'node:child_process';
import { manifestVersion, lanes } from './verify-tag.mjs';

// tools/docker/version.sh is the shell half of manifestVersion, used by the
// docker publish workflow where starting node per step is not worth it. They
// were four separate implementations with different rules, which meant the
// version a tag was checked against and the version its image was tagged with
// could disagree with nothing downstream able to tell. This is the assertion
// that keeps them one behaviour.
test('the shell version reader agrees with manifestVersion on every releasable project', () => {
	const root = new URL('../..', import.meta.url).pathname;
	const projects = JSON.parse(
		execFileSync('moon', ['query', 'projects'], { encoding: 'utf8', maxBuffer: 1 << 26, cwd: root }),
	).projects.filter((p) => lanes(p.config?.tags ?? []).length);

	assert.ok(projects.length > 50, 'expected the graph to have releasable projects');
	for (const project of projects) {
		const { file, version } = manifestVersion(root, project.source);
		const shell = execFileSync('bash', ['tools/docker/version.sh', file], {
			encoding: 'utf8',
			cwd: root,
		}).trim();
		assert.equal(shell, version, `${project.id} (${file})`);
	}
});
