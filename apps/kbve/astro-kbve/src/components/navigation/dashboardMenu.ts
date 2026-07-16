export interface NavNode {
	label: string;
	link?: string;
	staff?: boolean;
	items?: NavNode[];
}

export const dashboardNav: NavNode[] = [
	{ label: 'Overview', link: '/dashboard/' },
	{ label: 'Portal', link: '/dashboard/portal/', staff: true },
	{
		label: 'Account',
		items: [
			{ label: 'Account', link: '/dashboard/account/' },
			{ label: 'Marketplace', link: '/dashboard/market/' },
		],
	},
	{
		label: 'Workspace',
		items: [
			{ label: 'Kanban', link: '/dashboard/kanban/' },
			{ label: 'Report', link: '/dashboard/report/' },
			{ label: 'Graph', link: '/dashboard/graph/' },
			{ label: 'Security', link: '/dashboard/security/' },
		],
	},
	{
		label: 'Agents',
		items: [
			{ label: 'Overview', link: '/dashboard/agents/' },
			{ label: 'GitHub', link: '/dashboard/agents/github/' },
			{ label: 'DiscordSH', link: '/dashboard/agents/discordsh/' },
		],
	},
	{ label: 'API', link: '/dashboard/api/' },
	{ label: 'Edge', link: '/dashboard/edge/' },
	{ label: 'Workflows', link: '/dashboard/workflows/', staff: true },
	{ label: 'ArgoCD', link: '/dashboard/argo/', staff: true },
	{ label: 'ClickHouse', link: '/dashboard/clickhouse/', staff: true },
	{ label: 'Forgejo', link: '/dashboard/forgejo/', staff: true },
	{ label: 'Grafana', link: '/dashboard/grafana/', staff: true },
	{ label: 'Virtual Machines', link: '/dashboard/vm/', staff: true },
	{ label: 'IDE', link: '/dashboard/ide/', staff: true },
	{
		label: 'GameOps',
		staff: true,
		items: [
			{ label: 'Overview', link: '/dashboard/gameops/' },
			{ label: 'ROWS', link: '/dashboard/gameops/rows/' },
			{ label: 'Factorio', link: '/dashboard/gameops/factorio/' },
			{ label: 'Minecraft', link: '/dashboard/gameops/mc/' },
		],
	},
];

export const appsNav: NavNode[] = [
	{ label: 'Applications', link: '/application/' },
	{ label: 'Theory', link: '/theory/' },
	{ label: 'Projects', link: '/projects/' },
	{ label: 'Project Docs', link: '/project/' },
	{ label: 'API', link: '/api/' },
];

export const gamingNav: NavNode[] = [
	{ label: 'Gaming', link: '/gaming/' },
	{ label: 'Arcade', link: '/arcade/' },
	{ label: 'Minecraft', link: '/mc/' },
	{ label: 'OSRS', link: '/osrs/' },
	{
		label: 'Databases',
		items: [
			{ label: 'ItemDB', link: '/itemdb/' },
			{ label: 'NpcDB', link: '/npcdb/' },
			{ label: 'QuestDB', link: '/questdb/' },
			{ label: 'SpellDB', link: '/spelldb/' },
		],
	},
];

export function filterNav(nodes: NavNode[], isStaff: boolean): NavNode[] {
	return nodes
		.filter((n) => !n.staff || isStaff)
		.map((n) =>
			n.items ? { ...n, items: filterNav(n.items, isStaff) } : n,
		);
}
