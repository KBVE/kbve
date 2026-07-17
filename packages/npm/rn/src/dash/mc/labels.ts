export const MC_SERVER_ORDER = ['velocity', 'lobby', 'survival'];

const META: Record<string, { label: string; role: string }> = {
	velocity: {
		label: 'Velocity Proxy',
		role: 'Network edge — routes /glist, /alert, /send across backends.',
	},
	lobby: {
		label: 'Lobby Backend',
		role: 'Spawn world. List, kick, gamemode, broadcast.',
	},
	survival: {
		label: 'Survival Backend',
		role: 'Main play world. Whitelist, bans, world ops.',
	},
};

export function serverMeta(server: string): { label: string; role: string } {
	return META[server] ?? { label: server, role: '' };
}
