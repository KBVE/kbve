export const CONTENT_ROUTES = [
	{ path: '/guides/getting-started/', label: 'Getting Started guide' },
] as const;

export const GAME_ROUTES = [
	{ path: '/game/play/', label: 'Game play page' },
] as const;

export const AUTH_ROUTES = [
	{ path: '/auth/login/', label: 'Sign In page' },
	{ path: '/auth/logout/', label: 'Sign Out page' },
	{ path: '/auth/callback/', label: 'Auth callback page' },
] as const;

export const SPLASH_ROUTES = [{ path: '/', label: 'Homepage' }] as const;
