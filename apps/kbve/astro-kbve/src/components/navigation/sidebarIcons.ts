const ATTRS =
	'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

const PATHS: Record<string, string> = {
	grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
	folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
	cart: '<circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M2 3h3l2.4 12.4a1 1 0 0 0 1 .8h9.7a1 1 0 0 0 1-.8L22 7H6"/>',
	gamepad:
		'<rect x="2" y="6" width="20" height="12" rx="4"/><path d="M6 12h4M8 10v4"/><circle cx="15.5" cy="11" r="1"/><circle cx="18" cy="13.5" r="1"/>',
	joystick: '<circle cx="12" cy="7" r="3"/><path d="M12 10v7M8 21h8"/>',
	apps: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
	coins: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>',
	database:
		'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
	book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
	pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
	utensils:
		'<path d="M6 3v6a3 3 0 0 0 3 3v9M9 3v9M15 3c-1.5 0-3 2-3 5s1.5 4 3 4v9"/>',
	compass: '<circle cx="12" cy="12" r="9"/><path d="M16 8l-2 6-6 2 2-6z"/>',
	scale: '<path d="M12 3v18M5 21h14M7 7l-4 7h8zM17 7l-4 7h8zM7 7l5-2 5 2"/>',
	dot: '<circle cx="12" cy="12" r="4"/>',
};

const BY_LABEL: Record<string, string> = {
	Dashboard: 'grid',
	Project: 'folder',
	Marketplace: 'cart',
	Gaming: 'gamepad',
	Arcade: 'joystick',
	Applications: 'apps',
	Assets: 'coins',
	'Game Data': 'database',
	Theory: 'book',
	Blog: 'pen',
	Recipe: 'utensils',
	Guides: 'compass',
	Legal: 'scale',
};

export const sidebarIcon = (name?: string): string => {
	const inner = (name && PATHS[name]) || PATHS.dot;
	return `<svg ${ATTRS} width="18" height="18" aria-hidden="true">${inner}</svg>`;
};

export const sidebarIconForLabel = (label: string): string =>
	sidebarIcon(BY_LABEL[label]);
