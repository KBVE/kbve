/**
 * Fail when a workflow names a secret nothing can resolve.
 *
 * A missing secret does not error where it is written. It resolves to an empty
 * string and the step that consumes it fails somewhere else, saying something
 * about a password or a token rather than about a name that was never real.
 * Two of those cost a release each: `MY_GITHUB_TOKEN` (every docker publish,
 * "Password required") and `TRIGGER_PAT` (every post-publish, "Input required
 * and not supplied: token").
 *
 * A reference is legitimate when it is `secrets.GITHUB_TOKEN`, when the file
 * declares it as a `workflow_call` input of its own, or when the name is listed
 * in tools/ci/known-secrets.txt.
 *
 * Usage: node tools/ci/check-workflow-secrets.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

// moon runs a task from its project directory, so nothing here can be relative
// to the shell's cwd. Same anchor as pins.mjs next door.
const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const WORKFLOWS = join(root, '.github', 'workflows');
const INVENTORY = join(root, 'tools', 'ci', 'known-secrets.txt');
const REL = '.github/workflows';

/** The two lists in the inventory, by section header. */
export function readInventory(text) {
	const out = { exists: new Set(), missing: new Set() };
	let section = null;
	for (const raw of text.split('\n')) {
		const line = raw.trim();
		if (!line || line.startsWith('#')) continue;
		const header = line.match(/^\[(\w+)\]$/);
		if (header) {
			section = header[1];
			continue;
		}
		if (section && out[section]) out[section].add(line);
	}
	return out;
}

/** Secrets this file declares as its own workflow_call inputs. */
export function declaredSecrets(doc) {
	// `on:` parses as the boolean true in YAML 1.1, which is the note every
	// tool that reads a workflow ends up carrying.
	const on = doc?.on ?? doc?.[true] ?? {};
	return new Set(Object.keys(on?.workflow_call?.secrets ?? {}));
}

export function unresolvable(text, doc, known) {
	const declared = declaredSecrets(doc);
	const bad = [];
	text.split('\n').forEach((line, i) => {
		for (const m of line.matchAll(/secrets\.([A-Z0-9_]+)/g)) {
			const name = m[1];
			if (name === 'GITHUB_TOKEN' || declared.has(name) || known.has(name)) continue;
			bad.push({ line: i + 1, name });
		}
	});
	return bad;
}

/** Scan every workflow. Kept out of module scope so the tests can import
 * the helpers without the file reading the repository as a side effect. */
export function main() {
	const inv = readInventory(readFileSync(INVENTORY, 'utf8'));
	const known = new Set([...inv.exists, ...inv.missing]);
	
	let failed = 0;
	for (const file of readdirSync(WORKFLOWS).filter((f) => f.endsWith('.yml')).sort()) {
		const text = readFileSync(join(WORKFLOWS, file), 'utf8');
		let doc;
		try {
			doc = parse(text);
		} catch {
			// actionlint owns syntax; a file this cannot parse is its problem.
			continue;
		}
		for (const { line, name } of unresolvable(text, doc, known)) {
			console.error(
				`::error file=${REL}/${file},line=${line}::secrets.${name} is not in tools/ci/known-secrets.txt. ` +
					`Add it under [exists] once the secret is created, or under [missing] with the reason its lane tolerates the gap.`,
			);
			failed += 1;
		}
	}
	
	if (failed) {
		console.error(`\n${failed} unresolvable secret reference(s).`);
		process.exit(1);
	}
	console.log('All secret references resolve against tools/ci/known-secrets.txt.');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
	main();
}
