export const CONTENT_ROUTES = [
	{ path: '/guides/', label: 'Guides index' },
	{ path: '/guides/intro/', label: 'Introduction to Services' },
	{ path: '/guides/getting-started/', label: 'Getting Started' },
	{ path: '/application/', label: 'Applications index' },
	{ path: '/application/git/', label: 'Git documentation' },
	{ path: '/project/', label: 'Projects index' },
	{ path: '/gaming/', label: 'Gaming index' },
	{ path: '/stock/aapl/', label: 'AAPL stock page' },
	{ path: '/legal/', label: 'Legal index' },
	{ path: '/journal/01-01/', label: 'Journal entry' },
	{ path: '/webmaster/', label: 'Webmaster index' },
] as const;

export const AUTH_ROUTES = [
	{ path: '/login/', label: 'Login page' },
	{ path: '/register/', label: 'Register page' },
	{ path: '/logout/', label: 'Logout page' },
] as const;

export const DATA_ROUTES = [
	{ path: '/osrs/3rd-age-amulet/', label: 'OSRS item page' },
	{ path: '/questdb/auto-cooker-9000/', label: 'Quest page' },
	{ path: '/mapdb/adamantine-vein/', label: 'MapDB page' },
	{ path: '/itemdb/alchemist-stardust/', label: 'ItemDB item' },
] as const;

export const API_ROUTES = [
	{ path: '/api/applications.json', label: 'Applications API' },
	{ path: '/api/projects.json', label: 'Projects API' },
	{ path: '/api/itemdb.json', label: 'ItemDB API' },
	{ path: '/api/questdb.json', label: 'QuestDB API' },
	{ path: '/api/mapdb.json', label: 'MapDB API' },
] as const;

export const DASHBOARD_ROUTES = [
	{ path: '/dashboard/', label: 'Dashboard overview', title: 'Dashboard' },
	{ path: '/dashboard/profile/', label: 'Profile', title: 'Profile' },
	{ path: '/dashboard/account/', label: 'Account', title: 'Account' },
	{ path: '/dashboard/market/', label: 'Marketplace', title: 'Marketplace' },
	{ path: '/dashboard/kanban/', label: 'Kanban', title: 'Project Kanban' },
	{
		path: '/dashboard/kanban-data/',
		label: 'Kanban raw data',
		title: 'Kanban Raw Data',
	},
	{
		path: '/dashboard/report/',
		label: 'Report',
		title: 'NX Workspace Report',
	},
	{ path: '/dashboard/graph/', label: 'Graph', title: 'NX Dependency Graph' },
	{
		path: '/dashboard/security/',
		label: 'Security',
		title: 'Security Audit Report',
	},
	{ path: '/dashboard/api/', label: 'API reference', title: 'API Reference' },
	{ path: '/dashboard/agents/', label: 'Agents overview', title: 'Agents' },
	{
		path: '/dashboard/agents/github/',
		label: 'GitHub agent',
		title: 'GitHub provider',
	},
	{
		path: '/dashboard/agents/discordsh/',
		label: 'DiscordSH agent',
		title: 'DiscordSH agent',
	},
	{ path: '/dashboard/argo/', label: 'ArgoCD', title: 'ArgoCD Dashboard' },
	{
		path: '/dashboard/clickhouse/',
		label: 'ClickHouse',
		title: 'ClickHouse Logs',
	},
	{
		path: '/dashboard/edge/',
		label: 'Edge functions',
		title: 'Edge Functions',
	},
	{
		path: '/dashboard/forgejo/',
		label: 'Forgejo',
		title: 'Forgejo Dashboard',
	},
	{
		path: '/dashboard/grafana/',
		label: 'Grafana',
		title: 'Grafana Dashboard',
	},
	{ path: '/dashboard/vm/', label: 'VM dashboard', title: 'VM Dashboard' },
	{
		path: '/dashboard/vm/kasm/',
		label: 'KASM workspace',
		title: 'KASM Workspace',
	},
	{
		path: '/dashboard/ide/',
		label: 'Firecracker IDE',
		title: 'Firecracker IDE',
	},
	{
		path: '/dashboard/gameops/',
		label: 'GameOps overview',
		title: 'GameOps Dashboard',
	},
	{
		path: '/dashboard/gameops/rows/',
		label: 'ROWS',
		title: 'ROWS Dashboard',
	},
	{
		path: '/dashboard/gameops/factorio/',
		label: 'Factorio',
		title: 'Factorio Dashboard',
	},
	{
		path: '/dashboard/gameops/mc/',
		label: 'Minecraft',
		title: 'Minecraft Dashboard',
	},
] as const;

export const SIDEBAR_GROUPS = {
	Account: [
		{ label: 'Profile', href: '/dashboard/profile/' },
		{ label: 'Account', href: '/dashboard/account/' },
		{ label: 'Marketplace', href: '/dashboard/market/' },
	],
	Workspace: [
		{ label: 'Kanban', href: '/dashboard/kanban/' },
		{ label: 'Report', href: '/dashboard/report/' },
		{ label: 'Graph', href: '/dashboard/graph/' },
		{ label: 'Security', href: '/dashboard/security/' },
	],
} as const;

export const REDIRECT_ALIASES = [
	{ from: '/account', to: '/dashboard/account/' },
	{ from: '/account/', to: '/dashboard/account/' },
	{ from: '/profile', to: '/dashboard/profile/' },
	{ from: '/profile/', to: '/dashboard/profile/' },
	{ from: '/profile/account', to: '/dashboard/account/' },
	{ from: '/profile/account/', to: '/dashboard/account/' },
	{ from: '/profile/market', to: '/dashboard/market/' },
	{ from: '/profile/market/', to: '/dashboard/market/' },
	{ from: '/dashboard/rows', to: '/dashboard/gameops/rows/' },
	{ from: '/dashboard/rows/', to: '/dashboard/gameops/rows/' },
] as const;
