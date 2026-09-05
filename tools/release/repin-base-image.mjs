/**
 * Repin the Dockerfiles that build FROM a base image onto a published version.
 *
 * A base image is pinned by its consumers, and a floating pin is the reason a
 * stale publish is invisible: 79 Dockerfiles pinned chisel-ubuntu-axum's
 * `24.04-builder`, so the image under them changed identity -- and stopped
 * matching the workspace toolchain -- without a line of the repo changing.
 * Writing the version in makes that a diff, reviewable and bisectable.
 *
 * The consumer list is searched for, never declared. A hand-maintained list is
 * what the dispatch manifest was, and it ended up carrying 55 stale paths.
 *
 * Usage: node tools/release/repin-base-image.mjs <image> <version> [--dry-run]
 * Prints the files it changed, one per line.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

/** Every Dockerfile with a FROM line naming this image. */
export function consumers(image, cwd = process.cwd()) {
	// git grep, so untracked scratch files and anything gitignored stay out.
	const out = execFileSync(
		'git',
		['grep', '-lE', `^FROM .*${image}:`, '--', '*Dockerfile', '*Dockerfile.*'],
		{ cwd, encoding: 'utf8', maxBuffer: 1 << 24 },
		// git grep exits 1 when nothing matches, which is not an error here.
	).trim();
	return out ? out.split('\n') : [];
}

/**
 * Rewrite the tag on FROM lines only.
 *
 * `-builder` is part of the tag rather than the version, so it has to survive:
 * `:24.04-builder` becomes `:24.04.12-builder`, not `:24.04.12`. Comments and
 * documentation that mention a tag are prose, and a FROM-anchored pattern
 * leaves them alone.
 */
export function repin(text, image, version) {
	const pattern = new RegExp(
		// `FROM --platform=linux/amd64 <image>` puts flags between the two, so
		// this cannot anchor the image straight after FROM.
		`^(FROM\\s.*?${image.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}):(\\S+)`,
		'gm',
	);
	return text.replace(pattern, (_, head, tag) =>
		`${head}:${version}${tag.endsWith('-builder') ? '-builder' : ''}`,
	);
}

export function repinAll(image, version, cwd = process.cwd(), dryRun = false) {
	const changed = [];
	for (const file of consumers(image, cwd)) {
		const path = `${cwd}/${file}`;
		const before = readFileSync(path, 'utf8');
		const after = repin(before, image, version);
		if (after === before) continue;
		if (!dryRun) writeFileSync(path, after);
		changed.push(file);
	}
	return changed;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
	const [image, version] = process.argv.slice(2);
	if (!image || !version) {
		console.error(
			'Usage: node tools/release/repin-base-image.mjs <image> <version> [--dry-run]',
		);
		process.exit(2);
	}
	if (!/^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$/.test(version)) {
		console.error(`Refusing to write a non-semver version: '${version}'`);
		process.exit(2);
	}
	for (const file of repinAll(image, version, process.cwd(), process.argv.includes('--dry-run'))) {
		console.log(file);
	}
}
