#!/usr/bin/env node
/**
 * Put the C# a Unity game needs into its Generated/Proto folder, from
 * packages/proto and nowhere else.
 *
 * These classes used to be produced by `protoc --csharp_out` against
 * packages/data/proto, from inside whichever content generator happened to own
 * the registry. That left Unity parsing one schema's bytes with another
 * schema's classes -- the same mismatch that decoded 65 map object definitions
 * as 65 malformed zones, except Unity has no test to panic, so it reads wrong
 * data instead of failing.
 *
 * One script owns the folder rather than three generators writing into it,
 * because only an owner that knows every closure can tell a class that is still
 * needed from one left behind by a schema that moved. Empire is here for the
 * same reason: it is an FFI payload with no content generator to hang off, and
 * crates/uniti already encodes it from packages/proto, so Unity was the only
 * side still on the old schema.
 *
 * Usage:
 *   node packages/data/codegen/sync-unity-proto.mjs
 */

import { existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closureFileNames, syncCsharp } from './lib/csharp-sync.mjs';
import { kbveProtoDescriptor } from './lib/proto-descriptor.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

// Every root type a Unity system loads or exchanges over FFI. A game that adds
// one adds it here; nothing else needs to know.
const ROOT_TYPES = [
	'kbve.map.v1.MapRegistry',
	'kbve.npc.v1.NpcRegistry',
	'kbve.quest.v1.QuestRegistry',
	'kbve.empire.v1.EmpireSnapshot',
];

const TARGETS = [
	{
		name: 'rareicon',
		dir: resolve(
			repoRoot,
			'apps/rareicon/unity-rareicon/Assets/_RareIcon/Generated/Proto',
		),
	},
];

/**
 * Drops any `.cs` the closures did not ask for, and the `.meta` Unity wrote
 * beside it.
 *
 * Stale generated code does not announce itself: it compiles, and it offers a
 * type the schema no longer defines until something fails on a name nobody can
 * find in the module.
 */
function prune(dir, keep) {
	let removed = 0;
	for (const entry of readdirSync(dir)) {
		if (!entry.endsWith('.cs')) continue;
		if (keep.has(entry)) continue;
		rmSync(resolve(dir, entry));
		const meta = resolve(dir, `${entry}.meta`);
		if (existsSync(meta)) rmSync(meta);
		console.log(`  removed ${entry} (no longer in any closure)`);
		removed++;
	}
	return removed;
}

function main() {
	const descriptorPath = kbveProtoDescriptor();

	const keep = new Set();
	for (const type of ROOT_TYPES) {
		for (const file of closureFileNames(descriptorPath, type)) keep.add(file);
	}

	for (const target of TARGETS) {
		let copied = 0;
		for (const type of ROOT_TYPES) {
			copied += syncCsharp(descriptorPath, type, target.dir) ?? 0;
		}
		const removed = prune(target.dir, keep);
		console.log(
			`${target.name}: ${keep.size} C# files from packages/proto → ${relative(repoRoot, target.dir)}` +
				(removed > 0 ? ` (${removed} stale removed)` : ''),
		);
	}
}

main();
