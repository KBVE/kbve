// Regenerates scopes.lock.json from the project graph.
//
// The lock exists because a commit-msg hook runs on every commit and cannot
// afford to start moon -- that is most of a second before a person sees their
// editor close. This writes the offline copy; validate.mjs only reads it.
//
// Run it after adding or renaming a project. `moon run commit:sync` does that,
// and `moon run commit:check` fails when the lock is behind, so CI notices
// rather than a contributor discovering it as a rejected commit.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const LOCK = join(HERE, 'scopes.lock.json');
export const SCOPES = join(HERE, 'scopes.yml');

// The types this repository actually uses, checked against its own history.
// `deploy` and `release` are here because they appear in it; leaving them out
// would reject commits already in main.
export const TYPES = [
	'build',
	'chore',
	'ci',
	'deploy',
	'docs',
	'feat',
	'fix',
	'perf',
	'refactor',
	'release',
	'revert',
	'style',
	'test',
];

export function extraScopes(text) {
	return [...text.matchAll(/^\s*-\s*'([^']+)'/gm)].map((m) => m[1]);
}

export function buildLock(projectIds, extra) {
	return {
		// A note for whoever opens the file wondering whether to edit it.
		generated: 'tools/commit/sync.mjs -- do not edit by hand',
		types: [...TYPES].sort(),
		scopes: [...new Set([...projectIds, ...extra])].sort(),
	};
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
	const out = execFileSync('moon', ['query', 'projects'], {
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	});
	const ids = JSON.parse(out).projects.map((p) => p.id);
	const lock = buildLock(ids, extraScopes(readFileSync(SCOPES, 'utf8')));
	const text = JSON.stringify(lock, null, '\t') + '\n';

	if (process.argv.includes('--check')) {
		const current = (() => {
			try {
				return readFileSync(LOCK, 'utf8');
			} catch {
				return '';
			}
		})();
		if (current !== text) {
			console.error('::error::scopes.lock.json is stale. Run `moon run commit:sync` and commit it.');
			process.exit(1);
		}
		console.log(`scopes.lock.json is up to date (${lock.scopes.length} scopes).`);
	} else {
		writeFileSync(LOCK, text);
		console.log(`wrote ${lock.scopes.length} scopes and ${lock.types.length} types.`);
	}
}
