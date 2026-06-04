export type Tier = 'read' | 'write' | 'destructive';
export type Scope = 'velocity' | 'backend' | 'shared';

export interface CommandDef {
	name: string;
	label: string;
	template: string;
	args: { label: string; placeholder?: string }[];
	tier: Tier;
	scope: Scope;
	description: string;
}

export const MC_COMMANDS: CommandDef[] = [
	{
		name: 'list',
		label: 'List players',
		template: 'list',
		args: [],
		tier: 'read',
		scope: 'backend',
		description: 'Paper /list — online players on this backend.',
	},
	{
		name: 'tps',
		label: 'Server TPS',
		template: 'tps',
		args: [],
		tier: 'read',
		scope: 'backend',
		description: 'Paper-only — last 1m/5m/15m TPS averages.',
	},
	{
		name: 'save_all',
		label: 'Save world',
		template: 'save-all',
		args: [],
		tier: 'read',
		scope: 'backend',
		description: 'Flush world state to disk now.',
	},
	{
		name: 'glist',
		label: 'Global player list',
		template: 'glist',
		args: [],
		tier: 'read',
		scope: 'velocity',
		description: 'Velocity /glist — players across every proxied backend.',
	},
	{
		name: 'find',
		label: 'Find player',
		template: 'find {0}',
		args: [{ label: 'player', placeholder: 'name' }],
		tier: 'read',
		scope: 'velocity',
		description: 'Velocity /find — locate which backend a player is on.',
	},
	{
		name: 'server_info',
		label: 'Server info',
		template: 'server {0}',
		args: [{ label: 'server', placeholder: 'lobby | survival' }],
		tier: 'read',
		scope: 'velocity',
		description: 'Velocity /server — details about a registered backend.',
	},

	{
		name: 'say',
		label: 'Broadcast (this server)',
		template: 'say {0}',
		args: [{ label: 'message' }],
		tier: 'write',
		scope: 'backend',
		description: 'Broadcast a chat message on this backend.',
	},
	{
		name: 'alert',
		label: 'Broadcast (network)',
		template: 'alert {0}',
		args: [{ label: 'message' }],
		tier: 'write',
		scope: 'velocity',
		description:
			'Velocity /alert — broadcast across every proxied backend.',
	},
	{
		name: 'tp',
		label: 'Teleport',
		template: 'tp {0} {1}',
		args: [
			{ label: 'source', placeholder: 'player' },
			{ label: 'target', placeholder: 'player or x y z' },
		],
		tier: 'write',
		scope: 'backend',
		description: 'Paper /tp — teleport source to target.',
	},
	{
		name: 'send',
		label: 'Send player',
		template: 'send {0} {1}',
		args: [
			{ label: 'player' },
			{ label: 'target server', placeholder: 'lobby | survival' },
		],
		tier: 'write',
		scope: 'velocity',
		description: 'Velocity /send — move a player to another backend.',
	},
	{
		name: 'gamemode',
		label: 'Set gamemode',
		template: 'gamemode {0} {1}',
		args: [
			{ label: 'gamemode', placeholder: 'survival | creative | ...' },
			{ label: 'player' },
		],
		tier: 'write',
		scope: 'backend',
		description: 'Paper /gamemode <mode> <player>.',
	},
	{
		name: 'time_set',
		label: 'Set time',
		template: 'time set {0}',
		args: [{ label: 'value', placeholder: 'day | night | 6000' }],
		tier: 'write',
		scope: 'backend',
		description: 'Paper /time set.',
	},
	{
		name: 'weather',
		label: 'Set weather',
		template: 'weather {0}',
		args: [{ label: 'weather', placeholder: 'clear | rain | thunder' }],
		tier: 'write',
		scope: 'backend',
		description: 'Paper /weather.',
	},

	{
		name: 'kick',
		label: 'Kick player',
		template: 'kick {0} {1}',
		args: [{ label: 'player' }, { label: 'reason' }],
		tier: 'destructive',
		scope: 'backend',
		description: 'Paper /kick <player> <reason>.',
	},
	{
		name: 'op',
		label: 'Grant op',
		template: 'op {0}',
		args: [{ label: 'player' }],
		tier: 'destructive',
		scope: 'backend',
		description: 'Paper /op <player>. Persists across restarts.',
	},
	{
		name: 'deop',
		label: 'Revoke op',
		template: 'deop {0}',
		args: [{ label: 'player' }],
		tier: 'destructive',
		scope: 'backend',
		description: 'Paper /deop <player>.',
	},
	{
		name: 'ban',
		label: 'Ban player',
		template: 'ban {0} {1}',
		args: [{ label: 'player' }, { label: 'reason' }],
		tier: 'destructive',
		scope: 'backend',
		description: 'Paper /ban <player> <reason>.',
	},
	{
		name: 'pardon',
		label: 'Pardon player',
		template: 'pardon {0}',
		args: [{ label: 'player' }],
		tier: 'destructive',
		scope: 'backend',
		description: 'Paper /pardon <player>.',
	},
	{
		name: 'whitelist_add',
		label: 'Whitelist add',
		template: 'whitelist add {0}',
		args: [{ label: 'player' }],
		tier: 'destructive',
		scope: 'backend',
		description: 'Paper /whitelist add <player>.',
	},
	{
		name: 'whitelist_remove',
		label: 'Whitelist remove',
		template: 'whitelist remove {0}',
		args: [{ label: 'player' }],
		tier: 'destructive',
		scope: 'backend',
		description: 'Paper /whitelist remove <player>.',
	},
];

export function commandsForServer(
	server: 'velocity' | 'lobby' | 'survival',
): CommandDef[] {
	const matches = (c: CommandDef): boolean => {
		if (c.scope === 'shared') return true;
		if (server === 'velocity') return c.scope === 'velocity';
		return c.scope === 'backend';
	};
	return MC_COMMANDS.filter(matches);
}
