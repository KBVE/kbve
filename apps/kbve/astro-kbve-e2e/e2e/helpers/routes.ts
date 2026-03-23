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
