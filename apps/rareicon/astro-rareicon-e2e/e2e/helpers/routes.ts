export const SPLASH_ROUTES = [{ path: '/', label: 'Homepage' }] as const;

export const CONTENT_ROUTES = [
	{ path: '/guides/introduction/', label: 'Introduction guide' },
	{ path: '/guides/steam-demo/', label: 'Steam demo install guide' },
	{ path: '/guides/controls/', label: 'Controls reference' },
	{ path: '/game/overview/', label: 'Game overview' },
	{ path: '/game/factions/', label: 'Factions page' },
	{ path: '/steam/', label: 'Steam marketing landing' },
	{ path: '/press/', label: 'Press kit landing' },
] as const;

export const ICON_ROUTES = [
	{ path: '/icons/', label: 'Icon library landing' },
	{ path: '/icons/sword/', label: 'Sword term page' },
	{ path: '/icons/shield/', label: 'Shield term page' },
	{ path: '/icons/arrow-right/', label: 'Arrow-right term page' },
	{ path: '/icons/close/', label: 'Close term page' },
	{ path: '/icons/terminal/', label: 'Terminal term page' },
] as const;

/**
 * Brand / hand-crafted icon term pages — distinct from auto-generated
 * Lucide outlines. These should each render the license footer with a
 * source URL, plus visible attribution copy.
 */
export const BRAND_ICON_ROUTES = [
	{ path: '/icons/steam/', label: 'Steam brand glyph' },
	{ path: '/icons/itch/', label: 'itch.io brand glyph' },
	{ path: '/icons/bluesky/', label: 'Bluesky brand glyph' },
	{ path: '/icons/tiktok/', label: 'TikTok brand glyph' },
] as const;

/**
 * Concept terms that pull variants from multiple FOSS icon packs after
 * the codegen merger pass. Each should render the
 * `.ri-icon-term__multi-source` badge advertising the variant + source
 * counts. Pages picked from the dedup ledger to stay stable across regen.
 */
export const MULTI_SOURCE_ICON_ROUTES = [
	{ path: '/icons/python/', label: 'Python multi-source term' },
	{ path: '/icons/react/', label: 'React multi-source term' },
	{ path: '/icons/docker/', label: 'Docker multi-source term' },
	{ path: '/icons/rust/', label: 'Rust multi-source term' },
	{ path: '/icons/home/', label: 'Home multi-source term' },
	{ path: '/icons/heart/', label: 'Heart multi-source term' },
] as const;

/**
 * Catalog terms whose source carries CC BY attribution requirements
 * (Game Icons CC BY 3.0, Solar CC BY 4.0). License footer must render
 * the gold "Attribution required" callout for these pages.
 */
export const ATTRIBUTION_REQUIRED_ROUTES = [
	{ path: '/icons/broadsword/', label: 'Game Icons broadsword (CC BY 3.0)' },
	{
		path: '/icons/wizard-face/',
		label: 'Game Icons wizard-face (CC BY 3.0)',
	},
	{
		path: '/icons/dragon-head/',
		label: 'Game Icons dragon-head (CC BY 3.0)',
	},
] as const;
