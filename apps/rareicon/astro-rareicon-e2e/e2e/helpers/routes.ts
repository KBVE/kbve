export const SPLASH_ROUTES = [{ path: '/', label: 'Homepage' }] as const;

export const CONTENT_ROUTES = [
	{ path: '/guides/introduction/', label: 'Introduction guide' },
	{ path: '/guides/steam-demo/', label: 'Steam demo install guide' },
	{ path: '/guides/controls/', label: 'Controls reference' },
	{ path: '/game/overview/', label: 'Game overview' },
	{ path: '/game/factions/', label: 'Factions page' },
	{ path: '/steam/', label: 'Steam marketing landing' },
] as const;

export const ICON_ROUTES = [
	{ path: '/icons/', label: 'Icon library landing' },
	{ path: '/icons/sword/', label: 'Sword term page' },
	{ path: '/icons/shield/', label: 'Shield term page' },
	{ path: '/icons/arrow-right/', label: 'Arrow-right term page' },
	{ path: '/icons/close/', label: 'Close term page' },
	{ path: '/icons/terminal/', label: 'Terminal term page' },
] as const;
