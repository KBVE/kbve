#!/usr/bin/env node
/**
 * Full proto-to-zod pipeline — single command to regenerate everything.
 *
 * 1. Compiles all .proto files to .binpb descriptors via protoc
 * 2. Generates Zod schemas from each descriptor + config
 *
 * Usage:
 *   npx tsx packages/data/codegen/gen-all.mjs            # all protos
 *   npx tsx packages/data/codegen/gen-all.mjs clickhouse  # single proto by name
 */

import { generateAndWriteZod } from '../../npm/devops/src/lib/codegen/index.js';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const DENO_ZOD_IMPORT =
	"import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';";

const __dirname = dirname(fileURLToPath(import.meta.url));
const protoRoot = resolve(__dirname, '../proto');
const descriptorsDir = resolve(__dirname, 'descriptors');
const generatedDir = resolve(__dirname, 'generated');

// Registry: each entry maps a proto to its codegen config and output.
// Optional `outputPath` overrides the default `generated/<name>-schema.ts`.
const protos = [
	{
		name: 'common',
		protoFile: 'kbve/common.proto',
		package: 'kbve.common',
	},
	{
		name: 'npcdb',
		protoFile: 'npc/npcdb.proto',
		package: 'npc',
	},
	{
		name: 'itemdb',
		protoFile: 'item/itemdb.proto',
		package: 'item',
	},
	{
		name: 'spelldb',
		protoFile: 'spell/spelldb.proto',
		package: 'spell',
	},
	{
		name: 'questdb',
		protoFile: 'quest/questdb.proto',
		package: 'quest',
	},
	{
		name: 'mapdb',
		protoFile: 'map/mapdb.proto',
		package: 'map',
	},
	{
		name: 'clickhouse',
		protoFile: 'jedi/clickhouse.proto',
		package: 'clickhouse',
	},
	{
		name: 'argocd',
		protoFile: 'jedi/argocd.proto',
		package: 'argocd',
		vendorTo: [
			{ path: '../../npm/devops/src/lib/codegen/generated/argocd-schema.ts' },
		],
	},
	{
		name: 'osrs',
		protoFile: 'kbve/osrs.proto',
		package: 'kbve.osrs',
	},
	{
		name: 'agents',
		protoFile: 'kbve/agents.proto',
		package: 'kbve.agents',
		vendorTo: [
			{ path: '../../npm/droid/src/lib/agents/generated/agents-schema.ts' },
			{
				path: '../../../apps/kbve/edge/functions/_shared/agents-schema.ts',
				denoZod: true,
			},
		],
	},
	{
		name: 'discordsh',
		protoFile: 'kbve/discordsh.proto',
		package: 'kbve.discordsh',
	},
	{
		name: 'discordsh_agents',
		protoFile: 'kbve/discordsh.proto',
		package: 'kbve.discordsh',
		vendorTo: [
			{
				path: '../../npm/droid/src/lib/agents/generated/discordsh-agents-schema.ts',
			},
		],
	},
	{
		name: 'ci_registry',
		protoFile: 'kbve/ci_registry.proto',
		package: 'kbve.ci',
	},
	{
		name: 'vm',
		protoFile: 'kbve/vm.proto',
		package: 'kbve.vm',
	},
	{
		name: 'firecracker',
		protoFile: 'kbve/firecracker.proto',
		package: 'kbve.firecracker',
	},
	{
		name: 'rcon',
		protoFile: 'kbve/rcon.proto',
		package: 'kbve.rcon',
	},
	{
		name: 'ows',
		protoFile: 'ows/ows.proto',
		package: 'ows',
	},
	{
		name: 'forum',
		protoFile: 'kbve/forum.proto',
		package: 'kbve.forum',
	},
	{
		name: 'meme',
		protoFile: 'meme/meme.proto',
		package: 'meme',
	},
	{
		name: 'schema',
		protoFile: 'kbve/schema.proto',
		package: 'kbve.schema',
	},
	{
		name: 'redis',
		protoFile: 'jedi/redis.proto',
		package: 'redis',
	},
	{
		name: 'kbveproto',
		protoFile: 'kbve/kbveproto.proto',
		package: '',
	},
	{
		name: 'twitch',
		protoFile: 'jedi/twitch.proto',
		package: 'twitch',
	},
	{
		name: 'staff',
		protoFile: 'kbve/staff.proto',
		package: 'kbve.staff',
	},
	{
		name: 'profile',
		protoFile: 'kbve/profile.proto',
		package: 'kbve.profile',
	},
	{
		name: 'github',
		protoFile: 'git/github.proto',
		package: 'github',
	},
	{
		name: 'git_common',
		protoFile: 'git/git_common.proto',
		package: 'git',
	},
	{
		name: 'forgejo',
		protoFile: 'git/forgejo.proto',
		package: 'forgejo',
	},
	{
		name: 'snapshot',
		protoFile: 'kbve/snapshot.proto',
		package: 'kbve.snapshot',
	},
	{
		name: 'groq',
		protoFile: 'jedi/groq.proto',
		package: 'groq',
	},
	{
		name: 'jedi',
		protoFile: 'jedi/jedi.proto',
		package: 'jedi',
	},
	{
		name: 'pool',
		protoFile: 'kbve/pool.proto',
		package: 'kbve.pool',
	},
	{
		name: 'rows',
		protoFile: 'rows/rows.proto',
		package: 'rows',
	},
	{
		name: 'icons',
		protoFile: 'icon/icons.proto',
		package: 'icon',
	},
	{
		name: 'mc_lot',
		protoFile: 'kbve/mc/mc_lot.proto',
		package: 'kbve.mc',
	},
	{
		name: 'jobboard',
		protoFile: 'jobboard/jobboard.proto',
		package: 'jobboard',
	},
	{
		name: 'chat',
		protoFile: 'kbve/chat.proto',
		package: 'kbve.chat',
		vendorTo: [{ path: '../../npm/chat/src/generated/chat-schema.ts' }],
	},
	{
		name: 'telemetry',
		protoFile: 'kbve/telemetry.proto',
		package: 'kbve.telemetry',
		vendorTo: [
			{ path: '../../npm/observ/src/generated/telemetry-schema.ts' },
			{
				path: '../../npm/devops/src/lib/telemetry/generated/telemetry-schema.ts',
			},
		],
	},
	{
		name: 'workflow',
		protoFile: 'kbve/workflow.proto',
		package: 'kbve.workflow',
		vendorTo: [
			{ path: '../../npm/rn/src/workflows/generated/workflow-schema.ts' },
		],
	},
];

// Optional filter: pass a proto name as CLI arg to regenerate only that one
const filterName = process.argv[2];
const selected = filterName
	? protos.filter((p) => p.name === filterName)
	: protos;

if (filterName && selected.length === 0) {
	console.error(`Unknown proto: "${filterName}". Available: ${protos.map((p) => p.name).join(', ')}`);
	process.exit(1);
}

console.log('=== Proto-to-Zod Pipeline ===\n');

// Step 1: Compile selected protos to .binpb
console.log('Step 1: Compiling protos to descriptors...');
for (const proto of selected) {
	const binpb = resolve(descriptorsDir, `${proto.name}.binpb`);
	const cmd = `protoc --include_imports --descriptor_set_out="${binpb}" --proto_path="${protoRoot}" ${proto.protoFile}`;
	try {
		execSync(cmd, { stdio: 'pipe' });
		console.log(`  ✓ ${proto.protoFile} → ${proto.name}.binpb`);
	} catch (err) {
		console.error(`  ✗ ${proto.protoFile} failed:`);
		console.error(err.stderr?.toString() || err.message);
		process.exit(1);
	}
}

// Step 2: Generate Zod schemas from each descriptor
console.log('\nStep 2: Generating Zod schemas...');
for (const proto of selected) {
	const configPath = resolve(__dirname, `${proto.name}-zod-config.json`);
	const descriptorPath = resolve(descriptorsDir, `${proto.name}.binpb`);
	const outputPath = proto.outputPath
		? resolve(__dirname, proto.outputPath)
		: resolve(generatedDir, `${proto.name}-schema.ts`);

	await generateAndWriteZod({
		descriptorPath,
		configPath,
		outputPath,
		protoPackage: proto.package,
	});
	console.log(`  ✓ ${proto.name}-schema.ts`);

	for (const dest of proto.vendorTo ?? []) {
		const destPath = resolve(__dirname, dest.path);
		mkdirSync(dirname(destPath), { recursive: true });
		let body = readFileSync(outputPath, 'utf8');
		if (dest.denoZod) {
			body = body.replace(/^import \{ z \} from 'zod';$/m, DENO_ZOD_IMPORT);
		}
		if (dest.astroZod) {
			body = body.replace(
				/^import \{ z \} from 'zod';$/m,
				"import { z } from 'astro/zod';",
			);
		}
		writeFileSync(destPath, body);
		console.log(`    ↳ vendored → ${dest.path}`);
	}
}

console.log('\n=== Done ===');
