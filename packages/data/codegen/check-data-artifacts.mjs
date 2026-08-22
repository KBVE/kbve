#!/usr/bin/env node
/**
 * Fail when a committed data artifact no longer matches what its generator would produce
 * from the MDX source of truth.
 *
 * The MDX under `astro-kbve/src/content/docs/<db>/` is the catalog. Nothing at runtime reads
 * it: the games load the generated `<db>.json` / `<db>.binpb` mirrored into their asset
 * folders. So an MDX edit that is never regenerated is **silently inert** — the docs site
 * shows the new text, every game keeps shipping the old, and no test disagrees.
 *
 * That is not hypothetical. Two stale artifacts were found by accident rather than by CI:
 * npcdb had `personality: GRUFF` / `SERIOUS` committed for NPCs whose MDX had said `stoic`
 * for months, and itemdb's `iron-skin-potion` carried a description and lore that had been
 * rewritten in MDX and never regenerated. Both shipped to the games.
 *
 * Comparison is byte-for-byte, not parsed-and-deep-equal. Bytes were only trustworthy after
 * two fixes that landed with this check:
 *   - `.prettierignore` now covers every mirror. It previously missed the friendslop itemdb
 *     and questdb folders, so prettier reflowed those artifacts to tabs and every
 *     regeneration produced a whole-file diff with identical content.
 *   - the generators now sort their MDX filenames. `readdirSync` returns sorted order on
 *     APFS and hash order on ext4, so entry order — and therefore the .binpb wire bytes —
 *     differed between a contributor's machine and Linux CI.
 * With those in place bytes are the stronger check: they cover the .binpb mirrors too, which
 * a JSON deep-equal cannot reach without protoc. Like check-descriptors.mjs, this needs no
 * protoc of its own, so it runs in every CI lane.
 *
 * The generators write in place, so this runs them and then restores whatever it compared.
 * Their side outputs — the protoc-generated C# under Generated/Proto/ — are left as
 * regenerated; they are deterministic and already guarded by check-descriptors.mjs.
 *
 * Usage:
 *   node packages/data/codegen/check-data-artifacts.mjs
 */

import { execFileSync, spawnSync } from 'node:child_process';
import {
	existsSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

const generatedDir = resolve(__dirname, 'generated');
const unityStreamingAssets = resolve(
	repoRoot,
	'apps/rareicon/unity-rareicon/Assets/StreamingAssets',
);
const godotAssets = (db) =>
	resolve(repoRoot, `apps/friendslop/godot-friendslop/assets/${db}`);
const rareiconScript = (name) =>
	resolve(
		repoRoot,
		`apps/rareicon/unity-rareicon/Assets/_RareIcon/Scripts/ECS/DB/Items/Data/${name}`,
	);

// professiondb runs last because its generator reads generated/mapdb-data.json — checking it
// against a mapdb artifact this run has not refreshed yet would chase the wrong drift.
const DATABASES = [
	{
		db: 'npcdb',
		dirs: [generatedDir, unityStreamingAssets, godotAssets('npcdb')],
	},
	{
		db: 'itemdb',
		dirs: [generatedDir, unityStreamingAssets, godotAssets('itemdb')],
		extraFiles: [
			rareiconScript('ItemId.Generated.cs'),
			rareiconScript('ItemDBRefMap.Generated.cs'),
		],
	},
	{
		db: 'mapdb',
		dirs: [
			generatedDir,
			unityStreamingAssets,
			resolve(repoRoot, 'apps/discordsh/discordsh-bot/data'),
		],
	},
	{
		db: 'questdb',
		dirs: [generatedDir, unityStreamingAssets, godotAssets('questdb')],
	},
	{ db: 'spelldb', dirs: [generatedDir] },
	{
		db: 'professiondb',
		dirs: [generatedDir, unityStreamingAssets],
		extraFiles: [
			resolve(generatedDir, 'xref-index.json'),
			resolve(generatedDir, 'xref-index.binpb'),
		],
	},
];

/// Matches `<db>.json`, `<db>-data.binpb`, `<db>-runtime.json`, `<db>.es.json`, ... and
/// nothing belonging to a neighbouring db sharing the same directory.
function artifactPattern(db) {
	return new RegExp(`^${db}(?:[-.][A-Za-z0-9_-]+)*\\.(?:json|binpb)$`);
}

/// Paths git is told to ignore are declared build outputs, not committed artifacts.
/// rareicon's StreamingAssets/itemdb.{json,binpb} are the case: ci-unity regenerates them
/// before it builds the bundle, so they are absent from a fresh clone and present on any
/// machine that has run the generator once. Comparing them reports "generated but never
/// committed" on every CI run and never locally, which is a property of the clone rather
/// than of the MDX.
function ignoredByGit(paths) {
	if (paths.length === 0) return new Set();
	const res = spawnSync('git', ['check-ignore', '--stdin'], {
		cwd: repoRoot,
		input: paths.join('\n'),
		encoding: 'utf8',
	});
	// 0 = some path is ignored, 1 = none are. Anything else is git failing, and silently
	// treating that as "nothing ignored" would resurrect the false positive.
	if (res.status !== 0 && res.status !== 1) {
		throw new Error(
			`git check-ignore failed (${res.status}): ${(res.stderr || '').trim()}`,
		);
	}
	return new Set(
		res.stdout
			.split('\n')
			.filter(Boolean)
			.map((p) => resolve(repoRoot, p)),
	);
}

const skipped = new Set();

function collect({ db, dirs, extraFiles = [] }) {
	const pattern = artifactPattern(db);
	const paths = new Set(extraFiles);
	for (const dir of dirs) {
		if (!existsSync(dir)) continue;
		for (const name of readdirSync(dir)) {
			if (pattern.test(name)) paths.add(resolve(dir, name));
		}
	}
	const all = [...paths].sort();
	const ignored = ignoredByGit(all);
	for (const path of all) if (ignored.has(path)) skipped.add(path);
	return all.filter((path) => !ignored.has(path));
}

function snapshot(paths) {
	const bytes = new Map();
	for (const path of paths) {
		bytes.set(path, existsSync(path) ? readFileSync(path) : null);
	}
	return bytes;
}

function restore(before) {
	for (const [path, bytes] of before) {
		if (bytes === null) {
			if (existsSync(path)) rmSync(path);
		} else {
			writeFileSync(path, bytes);
		}
	}
}

/// Key an entry the way its db does. Every registry entry carries `ref`; locale tables key on
/// `key`; anything else falls back to its position so the report still names something.
function entryKey(entry, index) {
	if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
		for (const field of ['ref', 'id', 'key', 'slug', 'name']) {
			if (typeof entry[field] === 'string') return entry[field];
		}
	}
	return `#${index}`;
}

function entriesOf(parsed) {
	if (!parsed || typeof parsed !== 'object') return null;
	for (const value of Object.values(parsed)) {
		if (
			Array.isArray(value) &&
			value.length > 0 &&
			value.every((v) => v && typeof v === 'object')
		) {
			return value;
		}
	}
	return null;
}

/// Name the entries that moved, so a failure points at content rather than at a file size.
function describeDrift(committedBytes, freshBytes) {
	let committed;
	let fresh;
	try {
		committed = entriesOf(JSON.parse(committedBytes.toString('utf8')));
		fresh = entriesOf(JSON.parse(freshBytes.toString('utf8')));
	} catch {
		return [];
	}
	if (!committed || !fresh) return [];

	const index = (list) =>
		new Map(list.map((entry, i) => [entryKey(entry, i), entry]));
	const before = index(committed);
	const after = index(fresh);
	const notes = [];

	for (const key of after.keys()) {
		if (!before.has(key))
			notes.push(`+ ${key} (missing from the artifact)`);
	}
	for (const key of before.keys()) {
		if (!after.has(key)) notes.push(`- ${key} (no longer in the MDX)`);
	}
	for (const [key, entry] of before) {
		const next = after.get(key);
		if (!next) continue;
		const fields = [
			...new Set([...Object.keys(entry), ...Object.keys(next)]),
		]
			.filter((f) => JSON.stringify(entry[f]) !== JSON.stringify(next[f]))
			.sort();
		if (fields.length > 0) notes.push(`~ ${key}: ${fields.join(', ')}`);
	}
	if (notes.length === 0) {
		notes.push(
			JSON.stringify(committed) === JSON.stringify(fresh)
				? 'same content, different bytes — whitespace or key order; check .prettierignore'
				: 'entry order differs — same entries, different sequence',
		);
	}
	return notes;
}

const rel = (path) => relative(repoRoot, path);
const failures = [];

for (const spec of DATABASES) {
	const generator = `gen-${spec.db}-data.mjs`;
	const before = snapshot(collect(spec));

	try {
		execFileSync(process.execPath, [resolve(__dirname, generator)], {
			cwd: repoRoot,
			stdio: 'pipe',
		});
	} catch (err) {
		restore(before);
		failures.push({
			db: spec.db,
			generator,
			lines: [
				`${generator} exited non-zero:`,
				`  ${(err.stderr?.toString() || err.message).trim().split('\n').join('\n  ')}`,
			],
		});
		continue;
	}

	// Re-collect rather than reuse: a locale added in MDX produces artifacts that were never
	// committed, and those are exactly as stale as a changed one.
	const after = snapshot(collect(spec));
	const lines = [];

	for (const [path, freshBytes] of after) {
		const committedBytes = before.get(path) ?? null;
		if (freshBytes === null) continue;
		if (committedBytes === null) {
			lines.push(`${rel(path)} — generated but never committed`);
			continue;
		}
		if (committedBytes.equals(freshBytes)) continue;
		lines.push(
			`${rel(path)} — ${committedBytes.length} bytes committed, ${freshBytes.length} bytes generated`,
		);
		if (path.endsWith('.json')) {
			for (const note of describeDrift(committedBytes, freshBytes)) {
				lines.push(`    ${note}`);
			}
		}
	}
	for (const [path, committedBytes] of before) {
		if (committedBytes !== null && !existsSync(path)) {
			lines.push(
				`${rel(path)} — committed, but the generator no longer writes it`,
			);
		}
	}

	restore(before);
	if (lines.length > 0) failures.push({ db: spec.db, generator, lines });
}

// Named rather than counted: a path that quietly stops being checked because someone
// added a .gitignore rule is the failure mode this whole script exists to catch.
if (skipped.size > 0) {
	console.log(
		`skipped ${skipped.size} gitignored build output(s), regenerated at build time:`,
	);
	for (const path of [...skipped].sort()) {
		console.log(`  ${rel(path)}`);
	}
}

if (failures.length === 0) {
	console.log(
		`✓ ${DATABASES.length} data artifact sets match their MDX sources`,
	);
	process.exit(0);
}

for (const { db, generator, lines } of failures) {
	console.error(
		`\n${db} is stale (regenerate with: node packages/data/codegen/${generator}):`,
	);
	for (const line of lines) console.error(`  ${line}`);
}
console.error(
	'\nA stale data artifact is not cosmetic — the MDX is documentation, and the games load\n' +
		'only these files. Whatever the MDX says has had no effect on any shipped build.',
);
process.exit(1);
