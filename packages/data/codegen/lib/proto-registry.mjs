/**
 * The one list of protos this repo compiles: name, source `.proto`, package, and any vendored
 * copies of the generated schema.
 *
 * Extracted from `gen-all.mjs` so `check-descriptors.mjs` verifies exactly the set that
 * `gen-all.mjs` regenerates. Two copies of this list would drift, and a proto missing from the
 * checker's copy is precisely the case the checker exists to catch.
 */

// Registry: each entry maps a proto to its codegen config and output.
// Optional `outputPath` overrides the default `generated/<name>-schema.ts`.
export const protoRegistry = [
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
		name: 'professiondb',
		protoFile: 'profession/professiondb.proto',
		package: 'profession',
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
