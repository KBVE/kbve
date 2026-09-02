export const EXTERNAL_DOCS_SECTIONS = [
	{ prefix: 'legal', base: '../../../docs/legal' },
	{ prefix: 'guides', base: '../../../docs/guides' },
	{ prefix: 'stock', base: '../../../docs/stock' },
	{ prefix: 'theory', base: '../../../docs/theory' },
];

export const EXTERNAL_DOCS_ROOTS = EXTERNAL_DOCS_SECTIONS.map(
	({ prefix, base }) => ({ dir: base, prefix: `/${prefix}` }),
);
