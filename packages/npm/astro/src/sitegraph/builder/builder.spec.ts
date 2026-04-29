import { describe, expect, it } from 'vitest';
import { buildSiteGraph } from './index';
import { markdownExtractor } from './extractors/markdown';
import { mdxAnchorExtractor } from './extractors/mdx-anchor';
import { frontmatterLinksExtractor } from './extractors/frontmatter-links';
import { collectionRefsExtractor } from './extractors/collection-refs';
import type { SiteGraphEntry } from '../types';

const mkEntry = (
	id: string,
	body = '',
	data: Record<string, unknown> = {},
): SiteGraphEntry => ({ id, body, data });

describe('markdownExtractor', () => {
	it('captures inline markdown links and skips externals/assets/anchors', () => {
		const result = markdownExtractor(
			mkEntry(
				'a',
				`See [b](/b/), [c](/c.mdx), [external](https://example.com), [img](/foo.png), [hash](#section), [self](/a/).`,
			),
			'a',
		);
		expect(new Set(result.links)).toEqual(new Set(['b', 'c']));
	});

	it('strips /docs/ prefix and trailing slashes', () => {
		const result = markdownExtractor(
			mkEntry('root', `[x](/docs/foo/bar/) [y](/baz/qux)`),
			'root',
		);
		expect(new Set(result.links)).toEqual(new Set(['foo/bar', 'baz/qux']));
	});

	it('returns no links for empty body', () => {
		expect(markdownExtractor(mkEntry('a'), 'a').links).toEqual([]);
	});
});

describe('mdxAnchorExtractor', () => {
	it('captures JSX <a href> links', () => {
		const result = mdxAnchorExtractor(
			mkEntry(
				'a',
				`Some <a href="/b/" class="link">B</a> and <a href="/c">C</a>.`,
			),
			'a',
		);
		expect(new Set(result.links)).toEqual(new Set(['b', 'c']));
	});

	it('skips externals', () => {
		const result = mdxAnchorExtractor(
			mkEntry('a', `<a href="https://x.com/y">x</a>`),
			'a',
		);
		expect(result.links).toEqual([]);
	});
});

describe('frontmatterLinksExtractor', () => {
	it('reads string entries from default `links` field', () => {
		const ext = frontmatterLinksExtractor();
		const result = ext(mkEntry('a', '', { links: ['b', '/c/'] }), 'a');
		expect(new Set(result.links)).toEqual(new Set(['b', 'c']));
	});

	it('reads object entries with relationship', () => {
		const ext = frontmatterLinksExtractor();
		const result = ext(
			mkEntry('a', '', {
				links: [{ slug: 'b', relationship: 'see-also' }],
			}),
			'a',
		);
		expect(result.links).toEqual(['b']);
		expect(result.edges).toEqual({ b: 'see-also' });
	});

	it('honors custom field + default relationship', () => {
		const ext = frontmatterLinksExtractor({
			field: 'related',
			relationship: 'manual',
		});
		const result = ext(mkEntry('a', '', { related: ['b', 'c'] }), 'a');
		expect(result.edges).toEqual({ b: 'manual', c: 'manual' });
	});

	it('skips self-references and missing field', () => {
		const ext = frontmatterLinksExtractor();
		expect(
			ext(mkEntry('a', '', { links: ['a', '/a/'] }), 'a').links,
		).toEqual([]);
		expect(ext(mkEntry('a'), 'a').links).toEqual([]);
	});
});

describe('collectionRefsExtractor', () => {
	it('walks dot-paths and applies prefix + relationship', () => {
		const ext = collectionRefsExtractor({
			fields: [
				{
					path: 'meta.related',
					prefix: 'npc/',
					relationship: 'npc-ref',
				},
			],
		});
		const result = ext(
			mkEntry('a', '', { meta: { related: ['goblin', 'troll'] } }),
			'a',
		);
		expect(new Set(result.links)).toEqual(
			new Set(['npc/goblin', 'npc/troll']),
		);
		expect(result.edges).toEqual({
			'npc/goblin': 'npc-ref',
			'npc/troll': 'npc-ref',
		});
	});

	it('extracts ids from object refs', () => {
		const ext = collectionRefsExtractor({
			fields: [{ path: 'spawns', prefix: 'location/' }],
		});
		const result = ext(
			mkEntry('a', '', {
				spawns: [{ id: 'lumby' }, { slug: 'varrock' }],
			}),
			'a',
		);
		expect(new Set(result.links)).toEqual(
			new Set(['location/lumby', 'location/varrock']),
		);
	});
});

describe('buildSiteGraph', () => {
	const entries: SiteGraphEntry[] = [
		mkEntry('a', `Link to [b](/b) and [c](/c).`, { title: 'A' }),
		mkEntry('b', `Back to [a](/a).`, { title: 'B' }),
		mkEntry('c', `Orphan reachable from a.`, { title: 'C' }),
		mkEntry('orphan', `No outgoing or incoming.`, { title: 'Orphan' }),
	];

	it('computes outgoing links + reverse-adjacency backlinks', () => {
		const graph = buildSiteGraph(entries, {
			extractors: [markdownExtractor],
		});
		expect(graph.a.links).toEqual(expect.arrayContaining(['b', 'c']));
		expect(graph.b.backlinks).toEqual(['a']);
		expect(graph.c.backlinks).toEqual(['a']);
		expect(graph.orphan.links).toEqual([]);
		expect(graph.orphan.backlinks).toEqual([]);
	});

	it('preserves title from frontmatter, falls back to humanized slug', () => {
		const graph = buildSiteGraph([mkEntry('foo/bar-baz', '', {})], {
			extractors: [markdownExtractor],
		});
		expect(graph['foo/bar-baz'].title).toBe('Bar Baz');
	});

	it('merges edges from multiple extractors with later winning', () => {
		const a = mkEntry('a', `[b](/b)`, {
			links: [{ slug: 'b', relationship: 'manual' }],
		});
		const graph = buildSiteGraph([a, mkEntry('b', '', { title: 'B' })], {
			extractors: [markdownExtractor, frontmatterLinksExtractor()],
		});
		expect(graph.a.edges).toEqual({ b: 'manual' });
	});

	it('dedupes links across extractors', () => {
		const a = mkEntry('a', `[b](/b)`, {
			links: ['b'],
		});
		const graph = buildSiteGraph([a, mkEntry('b')], {
			extractors: [markdownExtractor, frontmatterLinksExtractor()],
		});
		expect(graph.a.links).toEqual(['b']);
	});

	it('strips index suffixes from id when slugifying', () => {
		const graph = buildSiteGraph(
			[mkEntry('foo/index', '', { title: 'Foo' })],
			{ extractors: [markdownExtractor] },
		);
		expect(Object.keys(graph)).toEqual(['foo']);
	});
});
