#!/usr/bin/env node
/**
 * Fail when a committed .binpb descriptor no longer matches its .proto source.
 *
 * The descriptors in `descriptors/` are build artifacts that everything downstream reads INSTEAD
 * of the `.proto` — the zod generator takes `descriptorPath`, not the proto. So a `.proto` edit
 * with no regeneration is **silently inert**: the schema, the TS types and the UE/C# headers all
 * keep describing the old shape and nothing fails.
 *
 * That is not hypothetical. `npcdb.binpb` was stale on `dev` (found in #15342): editing
 * `npcdb.proto` changed no generated output at all, and regenerating swept up unrelated fields
 * added long before (`moveSpeed`, `maxHunger`, `unitType`, `dialogueTreeId`, `nameKey`) that had
 * never made it into any generated artifact.
 *
 * Deliberately hash-based rather than a byte-diff of a fresh compile: see `lib/proto-closure.mjs`.
 * This check needs no protoc, so it runs in every CI lane.
 *
 * Usage:
 *   node packages/data/codegen/check-descriptors.mjs
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashProtoClosure } from './lib/proto-closure.mjs';
import { protoRegistry } from './lib/proto-registry.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const protoRoot = resolve(__dirname, '../proto');
const descriptorsDir = resolve(__dirname, 'descriptors');
const manifestPath = resolve(descriptorsDir, 'manifest.json');

if (!existsSync(manifestPath)) {
	console.error(
		'descriptors/manifest.json is missing. Regenerate with:\n' +
			'  npx tsx packages/data/codegen/gen-all.mjs',
	);
	process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const stale = [];
const missing = [];
const untracked = [];

for (const proto of protoRegistry) {
	if (!existsSync(resolve(descriptorsDir, `${proto.name}.binpb`))) {
		missing.push(proto.name);
		continue;
	}
	const recorded = manifest.protos?.[proto.name];
	if (!recorded) {
		untracked.push(proto.name);
		continue;
	}
	const actual = hashProtoClosure(protoRoot, proto.protoFile);
	if (recorded !== actual) stale.push(proto.name);
}

const problems = [
	['stale — the .proto changed but the descriptor was never rebuilt', stale],
	['missing a .binpb entirely', missing],
	['not in the manifest', untracked],
].filter(([, names]) => names.length > 0);

if (problems.length === 0) {
	console.log(
		`✓ ${protoRegistry.length} descriptors match their .proto sources`,
	);
	process.exit(0);
}

for (const [label, names] of problems) {
	console.error(`\n${names.length} ${label}:`);
	for (const name of names) console.error(`  - ${name}`);
}
console.error(
	'\nRegenerate, then commit the result:\n' +
		'  npx tsx packages/data/codegen/gen-all.mjs\n' +
		'\nA stale descriptor is not cosmetic — every generated schema, TS type and UE/C# header\n' +
		'is built from the .binpb, so the .proto edit has had no effect anywhere.',
);
process.exit(1);
