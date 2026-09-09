import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
	parseTag,
	cargoVersion,
	tomlVersion,
	godotVersion,
	compareSemver,
	semverParts,
	verify,
	releaseDoc,
	frontmatterField,
	TagError,
} from './verify-tag.mjs';

/** A throwaway tree holding just the manifest files a case needs. */
function fixtureRoot(files) {
	const root = mkdtempSync(join(tmpdir(), 'verify-tag-'));
	for (const [rel, body] of Object.entries(files)) {
		const abs = join(root, rel);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, body);
	}
	return root;
}

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

	// A lane tag says a project *can* publish, and every project carrying one
	// must therefore have a version to check its tag against. A `"private": true`
	// package.json does not count -- manifestVersion skips it by design, since an
	// npm stub is not a version claim -- so a private web game keeps a
	// version.toml beside it, the way herbmail-game does.
	//
	// Empty on purpose: a lane-tagged project with no version file is a release
	// that fails at tag time, so it fails here first.
	const unreleasable = [];

	for (const project of projects) {
		let manifest;
		try {
			manifest = manifestVersion(root, project.source);
		} catch {
			unreleasable.push(project.id);
			continue;
		}
		const { file, version } = manifest;
		const shell = execFileSync('bash', ['tools/docker/version.sh', file], {
			encoding: 'utf8',
			cwd: root,
		}).trim();
		assert.equal(shell, version, `${project.id} (${file})`);
	}

	assert.deepEqual(
		unreleasable,
		[],
		'a lane-tagged project with no version manifest — add a version.toml, or drop the lane tag',
	);
});

// ---------------------------------------------------------------------------
// The tag leads the manifest.
//
// A tag used to have to equal its manifest exactly, which meant every release
// carried a version-bump commit pushed before the tag. The tag now states the
// intent and the release syncs the manifest forward, so only a manifest AHEAD
// of its tag is fatal -- that direction cannot be honoured without moving an
// already-released number backwards.
// ---------------------------------------------------------------------------

test('compareSemver orders releases, prereleases and unparseable versions', () => {
	assert.ok(compareSemver('0.1.50', '0.1.51') < 0);
	assert.ok(compareSemver('0.1.51', '0.1.50') > 0);
	assert.equal(compareSemver('0.1.51', '0.1.51'), 0);
	// A release outranks its own prereleases.
	assert.ok(compareSemver('1.0.0-rc.1', '1.0.0') < 0);
	assert.ok(compareSemver('1.0.0-rc.1', '1.0.0-rc.2') < 0);
	// Unparseable sorts before parseable, so a malformed tag never reads newest.
	assert.ok(compareSemver('not-a-version', '1.0.0') < 0);
});

test('compareSemver treats a date-shaped version as ordinary semver', () => {
	// chisel-ubuntu-axum releases as 24.04.13; nothing may special-case it.
	// Core differences return the numeric gap rather than a normalised -1/1,
	// so callers must test the sign -- which is what the direction check does.
	assert.ok(compareSemver('24.04.11', '24.04.13') < 0);
	assert.ok(compareSemver('24.04.13', '24.04.11') > 0);
	assert.equal(compareSemver('24.04.13', '24.04.13'), 0);
});

test('semverParts ignores build metadata and rejects malformed input', () => {
	assert.deepEqual(semverParts('1.2.3+build.5').core, [1, 2, 3]);
	assert.equal(semverParts('1.2'), null);
});

test('verify accepts a tag ahead of its manifest and releases the tag version', () => {
	// The normal case now: manifest 0.1.50, tag 0.1.51.
	const node = { id: 'demo', source: 'x', config: { tags: ['docker'] } };
	const root = fixtureRoot({ 'x/version.toml': 'version = "0.1.50"\n' });
	const out = verify('demo@0.1.51', root, [], node);
	assert.equal(out.version, '0.1.51', 'the tag, not the manifest, is the release version');
	assert.equal(out.project, 'demo');
});

test('verify accepts a tag equal to its manifest', () => {
	const node = { id: 'demo', source: 'x', config: { tags: ['docker'] } };
	const root = fixtureRoot({ 'x/version.toml': 'version = "0.1.51"\n' });
	assert.equal(verify('demo@0.1.51', root, [], node).version, '0.1.51');
});

test('verify rejects a tag behind its manifest', () => {
	// Tagging 0.1.49 when 0.1.51 is committed would move a released number
	// backwards; that is a typo, not an intent.
	const node = { id: 'demo', source: 'x', config: { tags: ['docker'] } };
	const root = fixtureRoot({ 'x/version.toml': 'version = "0.1.51"\n' });
	assert.throws(
		() => verify('demo@0.1.49', root, [], node),
		(err) => err instanceof TagError && /already says/.test(err.message),
	);
});

test('verify still rejects a tag naming a different project than the node', () => {
	const node = { id: 'other', source: 'x', config: { tags: ['docker'] } };
	const root = fixtureRoot({ 'x/version.toml': 'version = "1.0.0"\n' });
	assert.throws(() => verify('demo@1.0.0', root, [], node), TagError);
});

// ---------------------------------------------------------------------------
// The project doc as the registry of a release's version files.
// ---------------------------------------------------------------------------

test('frontmatterField reads a top-level key and ignores nested ones', () => {
	const text = [
		'---',
		'title: T',
		'version: "1.0.0"',
		'kube:',
		'    version: "9.9.9"',
		'---',
		'',
		'Body mentioning version: "8.8.8".',
	].join('\n');
	assert.equal(frontmatterField(text, 'version'), '1.0.0');
	assert.equal(frontmatterField(text, 'title'), 'T');
	assert.equal(frontmatterField(text, 'absent'), null);
});

test('frontmatterField returns null when there is no frontmatter block', () => {
	assert.equal(frontmatterField('# Just a heading\n', 'version'), null);
});

test('releaseDoc matches on app_name, not on the filename', () => {
	// chisel-ubuntu-axum is documented in chisel.mdx and axum-kbve in api.mdx,
	// so resolving by filename finds neither.
	const root = fixtureRoot({
		'docs/project/chisel.mdx': [
			'---',
			'app_name: chisel-ubuntu-axum',
			'version: "24.04.13"',
			'version_toml: packages/docker/chisel-ubuntu-axum/version.toml',
			'---',
		].join('\n'),
	});
	const doc = releaseDoc(root, 'chisel-ubuntu-axum');
	assert.equal(doc.mdxPath, 'docs/project/chisel.mdx');
	assert.equal(doc.versionToml, 'packages/docker/chisel-ubuntu-axum/version.toml');
	assert.equal(doc.versionTarget, '', 'absent version_target reads as empty, not undefined');
});

test('releaseDoc reports both version files when the doc names both', () => {
	const root = fixtureRoot({
		'docs/project/edge.mdx': [
			'---',
			'app_name: edge',
			'version: "0.1.50"',
			'version_toml: services/functions/deno/version.toml',
			'version_target: services/functions/deno/deno.json',
			'---',
		].join('\n'),
	});
	assert.deepEqual(releaseDoc(root, 'edge'), {
		mdxPath: 'docs/project/edge.mdx',
		versionToml: 'services/functions/deno/version.toml',
		versionTarget: 'services/functions/deno/deno.json',
	});
});

test('releaseDoc returns empty paths for a project with no doc', () => {
	const root = fixtureRoot({ 'docs/project/other.mdx': '---\napp_name: other\n---' });
	assert.deepEqual(releaseDoc(root, 'demo'), {
		mdxPath: '',
		versionToml: '',
		versionTarget: '',
	});
});

test('verify falls back to the verified manifest when no doc names one', () => {
	// A project with no MDX still has its own version file synced forward.
	const node = { id: 'demo', source: 'x', config: { tags: ['docker'] } };
	const root = fixtureRoot({ 'x/version.toml': 'version = "1.0.0"\n' });
	const out = verify('demo@1.0.1', root, [], node);
	assert.equal(out.mdxPath, '');
	assert.equal(out.versionTomlPath, 'x/version.toml');
});
