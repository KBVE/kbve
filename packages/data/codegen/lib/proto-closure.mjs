/**
 * Content hashing for a .proto and everything it imports.
 *
 * Why hash the SOURCE rather than diff the descriptor: `protoc` output is not byte-stable across
 * versions, so comparing a freshly-compiled `.binpb` against the committed one fails whenever a
 * developer's protoc differs from CI's. Hashing the `.proto` text is exact, version-independent,
 * and lets the staleness CHECK run without protoc installed at all.
 *
 * The closure matters: `npcdb.proto` imports `kbve/common.proto`, and `--include_imports` bakes
 * the imported definitions into the descriptor. A change to `common.proto` therefore staleness
 * every descriptor that imports it, even though those `.proto` files are untouched.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const IMPORT_RE = /^\s*import\s+(?:public\s+|weak\s+)?"([^"]+)"\s*;/gm;

/**
 * Every proto path reachable from `entry`, including itself, relative to `protoRoot`.
 * Sorted, so the result does not depend on traversal order. Missing imports are skipped —
 * protoc is the authority on those, and this should not fail differently than the compile does.
 */
export function protoClosure(protoRoot, entry) {
	const seen = new Set();
	const queue = [entry];
	while (queue.length > 0) {
		const rel = queue.shift();
		if (seen.has(rel)) continue;
		let text;
		try {
			text = readFileSync(resolve(protoRoot, rel), 'utf8');
		} catch (err) {
			// The ENTRY must exist. An unreadable entry would otherwise hash to the empty
			// closure — the same value for every such proto — and the staleness check would
			// pass forever without ever looking at anything.
			if (rel === entry) {
				throw new Error(
					`proto not found: ${rel} (resolved under ${protoRoot}): ${err.message}`,
				);
			}
			// A missing IMPORT is protoc's to complain about, not ours; skipping keeps this
			// from failing in a second, more confusing place.
			continue;
		}
		seen.add(rel);
		for (const match of text.matchAll(IMPORT_RE)) {
			// Well-known types ship with protoc; they are not ours to track.
			if (match[1].startsWith('google/')) continue;
			queue.push(match[1]);
		}
	}
	return [...seen].sort();
}

/**
 * Hash of a proto and its import closure. Each file contributes its path as well as its bytes,
 * so moving a definition between two files changes the hash even if the total text does not.
 *
 * Newlines are normalised so a CRLF checkout does not read as a source change.
 */
export function hashProtoClosure(protoRoot, entry) {
	const hash = createHash('sha256');
	for (const rel of protoClosure(protoRoot, entry)) {
		hash.update(rel);
		hash.update('\0');
		hash.update(readFileSync(resolve(protoRoot, rel), 'utf8').replace(/\r\n/g, '\n'));
		hash.update('\0');
	}
	return hash.digest('hex');
}
