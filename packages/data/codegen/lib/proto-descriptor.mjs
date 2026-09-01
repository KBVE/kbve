/**
 * Builds -- and caches -- the FileDescriptorSet for `packages/proto`.
 *
 * The registries the generators encode against live there now, not in
 * `packages/data/proto`. That module is a buf workspace rather than a set of
 * protoc invocations, so its descriptor is produced by `buf build` over the
 * whole module: one descriptor covering every schema, instead of the per-proto
 * `descriptors/<name>.binpb` files the zod pipeline compiles.
 *
 * It is deliberately not committed -- `packages/proto/.gitignore` has reserved
 * the path since before anything produced it -- so it is built on demand and
 * rebuilt whenever a `.proto` is newer than it. A stale descriptor is the exact
 * failure this migration exists to fix, so staleness is checked rather than
 * assumed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../../..');
const protoRoot = resolve(repoRoot, 'packages/proto');
const descriptorPath = resolve(protoRoot, 'descriptor.binpb');
const buf = resolve(repoRoot, 'node_modules/.bin/buf');

function newestProtoMtime(dir) {
	let newest = 0;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = resolve(dir, entry.name);
		if (entry.isDirectory()) newest = Math.max(newest, newestProtoMtime(full));
		else if (entry.name.endsWith('.proto')) {
			newest = Math.max(newest, statSync(full).mtimeMs);
		}
	}
	return newest;
}

/** Absolute path to a descriptor set that is current with the schemas. */
export function kbveProtoDescriptor() {
	const fresh =
		existsSync(descriptorPath) &&
		statSync(descriptorPath).mtimeMs >=
			Math.max(
				newestProtoMtime(resolve(protoRoot, 'kbve')),
				statSync(resolve(protoRoot, 'buf.yaml')).mtimeMs,
			);
	if (fresh) return descriptorPath;

	if (!existsSync(buf)) {
		console.error(
			`FATAL: ${descriptorPath} is missing or stale and buf is not installed.`,
		);
		console.error('Run `pnpm install`, or build it by hand:');
		console.error('  cd packages/proto && buf build -o descriptor.binpb');
		process.exit(1);
	}
	execFileSync(buf, ['build', '-o', 'descriptor.binpb'], {
		cwd: protoRoot,
		stdio: 'pipe',
	});
	return descriptorPath;
}
