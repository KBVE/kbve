import type { ConsoleCommandDef, Tier } from '../mc/commands';

export type { ConsoleCommandDef, Tier };

/**
 * Where a command's effect actually lands. The worldserver is an Agones Fleet
 * behind an affinity-free ClusterIP, and ToCloud9 assigns maps per-worldserver,
 * so a `node` command reaches exactly one member of the fleet: `kick` answers
 * "player not found" when it hit a node that does not hold that player's map,
 * and `announce` reaches one node's sessions while reporting success. `realm`
 * commands write shared auth tables, so any node gives the same result.
 */
export type WowScope = 'realm' | 'node';

export interface WowCommandDef extends ConsoleCommandDef {
	scope: WowScope;
}

export const NODE_SCOPE_NOTE = 'one node';

export const NODE_SCOPE_DETAIL =
	'Reaches one worldserver of the fleet, not the whole realm. A negative result may only mean it hit a node that does not hold that player’s map.';

const node = <T extends Omit<WowCommandDef, 'scope' | 'note' | 'noteDetail'>>(
	def: T,
): WowCommandDef => ({
	...def,
	scope: 'node',
	note: NODE_SCOPE_NOTE,
	noteDetail: NODE_SCOPE_DETAIL,
});

const realm = <T extends Omit<WowCommandDef, 'scope'>>(
	def: T,
): WowCommandDef => ({ ...def, scope: 'realm' });

export const WOW_COMMANDS: WowCommandDef[] = [
	node({
		name: 'server_info',
		label: 'Server info',
		template: 'server info',
		args: [],
		tier: 'read',
		description: 'Core revision, uptime, player counts.',
	}),
	node({
		name: 'server_motd',
		label: 'Show MOTD',
		template: 'server motd',
		args: [],
		tier: 'read',
		description: 'Current message of the day.',
	}),
	node({
		name: 'gm_list',
		label: 'GM list',
		template: 'gm list',
		args: [],
		tier: 'read',
		description: 'Game masters online on this worldserver.',
	}),

	node({
		name: 'announce',
		label: 'Announce',
		template: 'announce {0}',
		args: [{ label: 'message' }],
		tier: 'write',
		description: 'Broadcast to the sessions held by one worldserver.',
	}),
	node({
		name: 'notify',
		label: 'Notify',
		template: 'notify {0}',
		args: [{ label: 'message' }],
		tier: 'write',
		description: 'On-screen notification to one worldserver’s sessions.',
	}),
	node({
		name: 'reload_config',
		label: 'Reload config',
		template: 'reload config',
		args: [],
		tier: 'write',
		description: 'Re-read worldserver.conf on one node without a restart.',
	}),
	realm({
		name: 'account_set_gmlevel',
		label: 'Set GM level',
		template: 'account set gmlevel {0} {1} {2}',
		args: [
			{ label: 'account' },
			{ label: 'level', placeholder: '0 - 3' },
			{ label: 'realm', placeholder: '-1 for all' },
		],
		tier: 'write',
		description: 'Grant or revoke GM rights on an account.',
	}),

	node({
		name: 'kick',
		label: 'Kick player',
		template: 'kick {0} {1}',
		args: [{ label: 'player' }, { label: 'reason' }],
		tier: 'destructive',
		description: 'Disconnect an online character.',
	}),
	realm({
		name: 'ban_account',
		label: 'Ban account',
		template: 'ban account {0} {1} {2}',
		args: [
			{ label: 'account' },
			{ label: 'duration', placeholder: '1d | 30m | -1' },
			{ label: 'reason' },
		],
		tier: 'destructive',
		description: 'Ban an account for a duration (-1 is permanent).',
	}),
	realm({
		name: 'unban_account',
		label: 'Unban account',
		template: 'unban account {0}',
		args: [{ label: 'account' }],
		tier: 'destructive',
		description: 'Lift an account ban.',
	}),
];

export function commandsForRealm(_realm: string): WowCommandDef[] {
	return WOW_COMMANDS;
}

export function commandsByScope(scope: WowScope): WowCommandDef[] {
	return WOW_COMMANDS.filter((c) => c.scope === scope);
}
