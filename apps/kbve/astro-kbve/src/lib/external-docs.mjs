const SECTION_PREFIXES = [
	'legal',
	'guides',
	'stock',
	'theory',
	'journal',
	'advanced',
	'api',
	'arcade',
	'askama',
	'auth',
	'bbs',
	'blog',
	'docs',
	'gaming',
	'graph',
	'lab',
	'market',
	'media',
	'music',
	'palworld',
	'rareicon',
	'recipe',
	'store',
	'tools',
	'travel',
	'webmaster',
	'wow',
];

export const EXTERNAL_DOCS_SECTIONS = SECTION_PREFIXES.map((prefix) => ({
	prefix,
	base: `../../../docs/${prefix}`,
}));

export const EXTERNAL_DOCS_ROOTS = EXTERNAL_DOCS_SECTIONS.map(
	({ prefix, base }) => ({ dir: base, prefix: `/${prefix}` }),
);
