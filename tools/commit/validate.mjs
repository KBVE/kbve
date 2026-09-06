#!/usr/bin/env node
// Checks a message against the conventional-commit shape this repository uses.
//
// Runs from the commit-msg hook on every commit, and against a pull request
// title in CI -- a title is composed in the browser where no hook runs, and
// tools/release/notes.mjs reads the type and scope out of the commits a
// release contains. An unconventional message silently lands under the wrong
// heading in someone's release notes rather than failing anything, which is a
// quiet failure worth catching loudly.
//
// The vocabulary is not listed here. Scopes come from the project graph via
// scopes.lock.json, plus the repository-wide ones in scopes.yml; a hook that
// runs on every commit cannot afford to start moon, and the lock is the
// offline copy.
//
// Usage: validate.mjs <file>        the commit-msg hook form; reads a file
//        validate.mjs --title '...' validate a string

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// Git's own prefixes and machinery. A merge or a revert is not something a
// person composed, and rejecting one would block a legitimate operation with
// no way to fix the message.
const EXEMPT = [
	/^Merge /,
	/^Revert /,
	/^fixup! /,
	/^squash! /,
	/^amend! /,
	/^Reapply /,
	// ci-atom.yml composes this title itself when it opens a pull request for
	// an atomic branch. Rejecting it would fail a workflow rather than teach
	// anyone anything.
	/^Atomic: /,
];

export function vocabulary(lockText) {
	const lock = JSON.parse(lockText);
	return { types: lock.types, scopes: lock.scopes };
}

/** Returns an array of problems; empty means fine. */
export function validate(message, { types, scopes }) {
	const subject = (message ?? '').split('\n').find((l) => !l.startsWith('#'))?.trim() ?? '';
	if (!subject) return ['the message is empty'];
	if (EXEMPT.some((re) => re.test(subject))) return [];

	// The type may be a pipe-separated list. `feat|style:` and `fix|style:`
	// appear forty-three times in this repository's three thousand subjects, so
	// it is an established form for a change that is genuinely two things, not
	// a mistake to correct.
	const m = /^([a-z]+(?:\|[a-z]+)*)(?:\(([^)]+)\))?(!)?: (.+)$/.exec(subject);
	if (!m) {
		return [
			`"${subject}" is not a conventional commit`,
			'expected: type(scope): subject   -- for example  fix(axum-kbve): stop the session cache going stale',
		];
	}
	const [, type, scope, , text] = m;
	const problems = [];
	const unknownTypes = type.split('|').filter((t) => !types.includes(t));
	if (unknownTypes.length) {
		problems.push(
			`unknown type${unknownTypes.length > 1 ? 's' : ''}: ${unknownTypes.join(', ')}. Use one of: ${types.join(', ')}`,
		);
	}
	if (scope !== undefined) {
		// A change can legitimately span a few projects --
		// `fix(reel,discordsh-bot,herbmail):` is in this repository's history --
		// so a comma-separated list is a scope, and each part is checked.
		// A leading `!` marks the scope as the salient part of the change --
		// `ci(!fix):`. Stripped before the check rather than rejected, because
		// it is a marker on a scope rather than a different scope.
		const parts = scope.split(',').map((s) => s.trim().replace(/^!/, ''));
		// A type name is a legitimate scope. `fix(ci):` says where, `ci(fix):`
		// says what, and both are in this repository's history.
		const unknown = parts.filter((s) => !scopes.includes(s) && !types.includes(s));
		if (unknown.length) {
			// Say the answer rather than where to go and look for it. The scope
			// list mixes conventions -- `KBVEWorld` beside `kbve-py` beside
			// `astro-kbve` -- so getting the case or a separator wrong is the
			// likely mistake, and it is one the list itself can resolve. The
			// title is composed in a browser where no hook runs, so this message
			// in a failed check is the only place anyone finds out.
			const near = (s) => {
				const fold = (k) => k.toLowerCase().replace(/[-_]/g, '');
				return scopes.find((k) => fold(k) === fold(s));
			};
			const named = unknown
				.map((s) => {
					const guess = near(s);
					return guess ? `${s} (did you mean ${guess}?)` : s;
				})
				.join(', ');
			problems.push(`unknown scope${unknown.length > 1 ? 's' : ''}: ${named}`);
			problems.push('use a moon project id (moon query projects), or one from tools/commit/scopes.yml');
		}
	}
	// No style rules. Three were tried against this repository's own history and
	// all three were wrong about it: "no trailing full stop" rejected 112 of
	// 800 subjects, "no leading capital" rejected 61 of 3000 -- most of them
	// proper nouns, `feat(npcdb): Marlow's conversation moves...` -- and a
	// length cap rejected 25 subjects that simply had a lot to say.
	//
	// What is left is structural: is it a conventional commit, is the type one
	// this repository uses, is the scope a real one. Those catch typos and
	// malformed messages, which is what a hook can usefully catch. Style is a
	// review comment, not an exit code.
	return problems;
}

function main() {
	const argv = process.argv.slice(2);
	const message = argv[0] === '--title' ? argv[1] : readFileSync(argv[0], 'utf8');
	const problems = validate(
		message,
		vocabulary(readFileSync(join(HERE, 'scopes.lock.json'), 'utf8')),
	);
	if (!problems.length) return;
	console.error('commit message:');
	for (const p of problems) console.error(`  ${p}`);
	console.error('');
	console.error('Scopes come from the moon project graph; repository-wide ones are in');
	console.error('tools/commit/scopes.yml. Regenerate with `moon run commit:sync`.');
	process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
