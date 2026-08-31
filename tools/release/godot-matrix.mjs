// Which Godot projects a change touches, and what each needs to build.
//
// This was .github/scripts/godot_test_matrix.py reading the `godot` lane of
// .github/ci-dispatch-manifest.json, plus a scan over every Cargo.toml in the
// tree to work out which directory a gdextension crate lived in so it could ask
// whether that directory changed. moon already knows both: a Godot project
// declares `dependsOn: ['q']`, and `--affected` answers the question the path
// comparison was approximating.
//
// A project is a Godot project here if it declares ENGINE_CONFIG in its env --
// the same blob release.yml hands the build workflow, and the same test as "the
// manifest had an entry for it", except the declaration lives beside the
// project and there is exactly one of it. Keeping a second set of keys just for
// this matrix would be the manifest's drift problem in miniature.

import { execFileSync } from 'node:child_process';

export function matrixFrom(projects, affected) {
	const wanted = affected === null ? null : new Set(affected);
	return projects
		.filter((p) => (p.config?.tags ?? []).includes('godot') && p.config?.env?.ENGINE_CONFIG)
		.filter((p) => wanted === null || wanted.has(p.id))
		.map((p) => {
			const engine = JSON.parse(p.config.env.ENGINE_CONFIG);
			return {
				app_name: p.id,
				project_path: p.source,
				godot_version: engine.version ?? '',
				// The extension crate is the dependency, not a repeated string.
				// A Godot project with no rust dependency gets an empty package
				// and the workflow skips its build steps.
				package: (p.dependencies ?? [])[0]?.id ?? '',
				addon_path: engine.gdextension?.addon_path ?? '',
				features: (engine.features ?? []).join(','),
			};
		})
		.sort((a, b) => a.app_name.localeCompare(b.app_name));
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

function changedFiles(base, head) {
	return execFileSync('moon', ['query', 'changed-files', '--base', base, '--head', head], {
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	});
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
	const [base, head] = process.argv.slice(2);
	// No base means "run everything": a manual dispatch, or a push where there
	// is nothing to compare against. Narrowing on a bad guess would silently
	// skip the suite, which looks the same as passing it.
	// --downstream deep, because the reason to run this suite is usually that
	// the gdextension crate changed rather than the Godot project. moon
	// defaults to `none`, which would report the project unaffected by a change
	// to the crate it loads -- the exact case the python script scanned every
	// Cargo.toml in the tree to catch.
	const affected = base
		? query(['--affected', '--downstream', 'deep'], changedFiles(base, head || 'HEAD')).map(
				(p) => p.id,
			)
		: null;
	process.stdout.write(JSON.stringify(matrixFrom(query([]), affected)) + '\n');
}
