import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readVersion(appDir) {
	try {
		const source = readFileSync(
			fileURLToPath(new URL('../version.toml', appDir)),
			'utf8',
		);
		return source.match(/^\s*version\s*=\s*['"]([^'"]+)['"]/m)?.[1] ?? null;
	} catch {
		return null;
	}
}

function readCommit(appDir) {
	const fromEnv =
		process.env.PUBLIC_BUILD_COMMIT ??
		process.env.GITHUB_SHA ??
		process.env.CF_PAGES_COMMIT_SHA ??
		process.env.VERCEL_GIT_COMMIT_SHA;

	if (fromEnv) return fromEnv.slice(0, 7);

	try {
		return (
			execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
				cwd: fileURLToPath(appDir),
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore'],
			}).trim() || null
		);
	} catch {
		return null;
	}
}

export function readBuildInfo(appDir) {
	const commit = readCommit(appDir);

	return {
		version: readVersion(appDir),
		commit,
		commitUrl: commit
			? `https://github.com/kbve/kbve/commit/${commit}`
			: null,
		builtAt: new Date().toISOString(),
	};
}
