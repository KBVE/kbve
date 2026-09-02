/**
 * Copies the C# a registry needs out of `packages/proto/gen/csharp` and into a
 * game's Generated/Proto folder.
 *
 * The generators used to run `protoc --csharp_out` against
 * `packages/data/proto`. That produced classes from one schema while the
 * `.binpb` beside them in StreamingAssets was encoded from another, which is
 * the same mismatch that decoded 65 map object definitions as 65 malformed
 * zones -- except Unity has no test to panic, so it reads wrong data instead of
 * failing. The C# now comes from the same module the artifacts are encoded
 * against, and protoc is no longer involved.
 *
 * Only the transitive closure of the registry's own `.proto` is copied. buf
 * generates all 67 schemas, and a game that loads the mapdb has no use for the
 * market or forum types -- Unity compiles everything in Assets, so copying the
 * lot would cost build time for classes nothing references.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromBinary } from '@bufbuild/protobuf';
import { FileDescriptorSetSchema } from '@bufbuild/protobuf/wkt';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../../..');
const csharpDir = resolve(repoRoot, 'packages/proto/gen/csharp');

/** `kbve/map/v1/map_registry.proto` -> `MapRegistry.cs`, which is how buf names it. */
function csharpFileName(protoPath) {
	const stem = basename(protoPath, '.proto');
	const pascal = stem
		.split('_')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');
	return `${pascal}.cs`;
}

/** Every `.proto` the named message's file pulls in, itself included. */
function closureOf(descriptorPath, typeName) {
	const set = fromBinary(FileDescriptorSetSchema, readFileSync(descriptorPath));
	const byName = new Map(set.file.map((f) => [f.name, f]));

	const messageName = typeName.slice(typeName.lastIndexOf('.') + 1);
	const packageName = typeName.slice(0, typeName.lastIndexOf('.'));
	const root = set.file.find(
		(f) =>
			f.package === packageName &&
			f.messageType.some((m) => m.name === messageName),
	);
	if (!root) {
		throw new Error(`FATAL: no .proto in ${descriptorPath} declares ${typeName}`);
	}

	const seen = new Set();
	const queue = [root.name];
	while (queue.length > 0) {
		const name = queue.pop();
		if (seen.has(name)) continue;
		seen.add(name);
		for (const dep of byName.get(name)?.dependency ?? []) queue.push(dep);
	}
	return [...seen];
}

/**
 * Writes the closure into `destDir`.
 *
 * Nothing is swept: three registries share this folder and each knows only its
 * own closure, so a generator that deleted what it did not recognise would
 * delete the other two's classes on every run.
 */
export function closureFileNames(descriptorPath, typeName) {
	const names = new Set();
	for (const protoPath of closureOf(descriptorPath, typeName)) {
		// Well-known types ship with the runtime Google.Protobuf DLL.
		if (protoPath.startsWith('google/')) continue;
		names.add(csharpFileName(protoPath));
	}
	return names;
}

export function syncCsharp(descriptorPath, typeName, destDir) {
	if (!existsSync(csharpDir)) {
		console.warn(
			`[warn] ${csharpDir} is missing — run \`moon run protobuf:build\` to generate it.`,
		);
		console.warn('       Skipping C# sync; the committed classes may be stale.');
		return;
	}
	mkdirSync(destDir, { recursive: true });

	const wanted = closureFileNames(descriptorPath, typeName);

	let copied = 0;
	for (const file of wanted) {
		const src = resolve(csharpDir, file);
		if (!existsSync(src)) {
			throw new Error(`FATAL: ${file} is in the closure of ${typeName} but not in ${csharpDir}`);
		}
		copyFileSync(src, resolve(destDir, file));
		copied++;
	}
	return copied;
}
