// Every image the workspace publishes, off the project graph.
//
// This was `jq '[.docker[].image]' .github/ci-dispatch-manifest.json`. The
// manifest is gone, and the same fact is already in the graph: a project in the
// docker lane has a `-publish` task whose buildx command names the image it
// writes. Reading it here means the registry cleanup cannot prune an image the
// workspace still builds, or miss one added since a list was last edited.
//
// Names are printed without the `kbve/` prefix, which is what
// snok/container-retention-policy expects.

import { execFileSync } from 'node:child_process';

export function imagesFrom(projects) {
	const names = new Set();
	for (const project of projects) {
		if (!(project.config?.tags ?? []).includes('docker')) continue;
		for (const [id, task] of Object.entries(project.tasks ?? {})) {
			if (!id.endsWith('-publish')) continue;
			const command = task.script ?? [task.command, ...(task.args ?? [])].join(' ');
			// Every `-t` in the command, not just the first: a task that tags
			// both ghcr.io/kbve/x and kbve/x names one image twice, and one
			// that builds a builder and a runtime names two.
			for (const match of command.matchAll(/-t\s+(?:ghcr\.io\/)?([A-Za-z0-9._/-]+):/g)) {
				names.add(match[1].replace(/^kbve\//, ''));
			}
		}
	}
	return [...names].sort();
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
	const out = execFileSync('moon', ['query', 'projects'], {
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	});
	const names = imagesFrom(JSON.parse(out).projects);
	if (names.length === 0) {
		console.error('::error::No images resolved from the project graph.');
		process.exit(1);
	}
	console.log(names.join(' '));
}
