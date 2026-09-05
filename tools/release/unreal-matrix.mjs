// Which Unreal plugins a change touches, per platform, in build order.
//
// This was .github/scripts/ue-plugin-matrix.mjs reading the `unreal` lane of
// .github/ci-dispatch-manifest.json. Three things it did by hand are now the
// graph's job: `dependency_plugins` is `dependsOn`, the topological sort is
// moon's dependency order, and the fixed-point loop that grew the selection to
// every dependent is `--affected --downstream deep`.
//
// The manifest also spelled out transitive dependencies -- KBVENet listed
// KBVEYYJson, which it reaches through KBVENPCDB. Those come out equal here
// because the closure is computed rather than written down.

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const BUILD_PLATFORMS = ['Linux', 'Win64', 'Mac'];

/**
 * Every plugin this one needs built first, deepest first.
 *
 * utils-unreal-build.yml takes a space-separated list and builds them in order, so
 * a dependency has to appear before the plugin that needs it. Depth-first
 * post-order gives that; the visited set makes a diamond appear once.
 */
export function orderedDeps(id, deps) {
	const out = [];
	const done = new Set();
	const stack = new Set();
	const visit = (node) => {
		// A cycle would otherwise recurse forever. Unreal would reject one too,
		// but this should not be where that is discovered.
		if (done.has(node) || stack.has(node)) return;
		stack.add(node);
		for (const d of deps.get(node) ?? []) visit(d);
		stack.delete(node);
		done.add(node);
		out.push(node);
	};
	for (const d of deps.get(id) ?? []) visit(d);
	return out;
}

export function matrixFrom(plugins, selected, imageTag) {
	const deps = new Map(plugins.map((p) => [p.id, (p.dependencies ?? []).map((d) => d.id)]));
	const lanes = { Linux: [], Win64: [], Mac: [] };

	for (const plugin of plugins) {
		if (selected !== null && !selected.has(plugin.id)) continue;
		const platforms = (plugin.config?.env?.UE_SUPPORTED_PLATFORMS ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter((p) => BUILD_PLATFORMS.includes(p));
		for (const platform of platforms) {
			lanes[platform].push({
				key: plugin.id,
				plugin_name: plugin.id,
				plugin_path: plugin.source,
				dependency_plugins: orderedDeps(plugin.id, deps)
					.map((d) => plugins.find((p) => p.id === d)?.source)
					.filter(Boolean)
					.join(' '),
				ue_image_tag: imageTag,
				platform,
			});
		}
	}
	for (const lane of Object.values(lanes)) lane.sort((a, b) => a.key.localeCompare(b.key));
	return lanes;
}

function query(args, input) {
	return JSON.parse(
		execFileSync('moon', ['query', 'projects', ...args], {
			encoding: 'utf8',
			maxBuffer: 64 * 1024 * 1024,
			input,
		}),
	).projects;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
	const mode = (process.env.MODE || 'changed').trim();
	const imageTag = (process.env.UE_IMAGE_TAG || 'dev-5.8.0').trim();
	const plugins = query(['--tags', 'unreal']);

	let selected = null;
	if (mode !== 'all') {
		const files = (process.env.CHANGED_FILES || '')
			.split('\n')
			.map((s) => s.trim())
			.filter(Boolean);
		// --downstream deep is the fixed-point loop the old script ran: a plugin
		// whose dependency changed has to rebuild too.
		const affected = query(['--affected', '--downstream', 'deep'], JSON.stringify({ files }));
		selected = new Set(affected.map((p) => p.id));
	}

	const lanes = matrixFrom(plugins, selected, imageTag);
	const out = process.env.GITHUB_OUTPUT;
	const write = (key, value) => {
		if (out) appendFileSync(out, `${key}=${value}\n`);
		else console.log(`${key}=${value}`);
	};
	write('linux', JSON.stringify({ include: lanes.Linux }));
	write('win', JSON.stringify({ include: lanes.Win64 }));
	write('mac', JSON.stringify({ include: lanes.Mac }));
	write('has_linux', String(lanes.Linux.length > 0));
	write('has_win', String(lanes.Win64.length > 0));
	write('has_mac', String(lanes.Mac.length > 0));

	const picked = [...new Set(Object.values(lanes).flat().map((e) => e.key))].sort();
	console.error(`mode=${mode} selected=${picked.length}`);
	console.error(
		`linux=${lanes.Linux.length} win=${lanes.Win64.length} mac=${lanes.Mac.length}`,
	);
	console.error(`plugins: ${picked.join(', ') || '(none)'}`);
}
