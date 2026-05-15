import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
	osrsExtractor,
	osrsEdgeColors,
	osrsEdgeDashes,
	osrsEdgeLabels,
	osrsTagOf,
} from './osrs-extractor';

const entry = (data: Record<string, any>): any => ({
	data,
	id: 'osrs/test',
	body: '',
	collection: 'docs',
});

describe('osrsExtractor', () => {
	it('returns empty links when frontmatter has no osrs block', () => {
		const result = osrsExtractor(entry({}), 'osrs/foo');
		expect(result).toEqual({ links: [] });
	});

	it('extracts related_items by slug', () => {
		const result = osrsExtractor(
			entry({
				osrs: {
					related_items: [
						{ slug: 'rune-axe', relationship: 'upgrade' },
					],
				},
			}),
			'osrs/iron-axe',
		);
		expect(result.links).toEqual(['osrs/rune-axe']);
		expect(result.edges?.['osrs/rune-axe']).toBe('upgrade');
	});

	it('derives slug from item_name when slug missing', () => {
		const result = osrsExtractor(
			entry({
				osrs: {
					related_items: [{ item_name: 'Dragon Long Sword' }],
				},
			}),
			'osrs/some-item',
		);
		expect(result.links).toEqual(['osrs/dragon-long-sword']);
		expect(result.edges?.['osrs/dragon-long-sword']).toBe('related');
	});

	it('drops self-references', () => {
		const result = osrsExtractor(
			entry({
				osrs: {
					related_items: [{ slug: 'rune-axe' }],
				},
			}),
			'osrs/rune-axe',
		);
		expect(result.links).toEqual([]);
	});

	it('recipes link to product and material with respective edges', () => {
		const result = osrsExtractor(
			entry({
				osrs: {
					recipes: [
						{
							product: 'Steel Bar',
							materials: [{ item_name: 'Iron Ore' }],
						},
					],
				},
			}),
			'osrs/coal',
		);
		expect(result.links).toContain('osrs/steel-bar');
		expect(result.links).toContain('osrs/iron-ore');
		expect(result.edges?.['osrs/steel-bar']).toBe('product');
		expect(result.edges?.['osrs/iron-ore']).toBe('component');
	});

	it('drop_table sources resolve to drop-source edges', () => {
		const result = osrsExtractor(
			entry({
				osrs: {
					drop_table: { sources: [{ source: 'King Black Dragon' }] },
				},
			}),
			'osrs/dragon-claws',
		);
		expect(result.links).toEqual(['osrs/king-black-dragon']);
		expect(result.edges?.['osrs/king-black-dragon']).toBe('drop-source');
	});

	it('drop_table can also be a plain array of source objects', () => {
		const result = osrsExtractor(
			entry({
				osrs: {
					drop_table: [
						{ source: 'Goblin' },
						{ source: 'Hill Giant' },
					],
				},
			}),
			'osrs/bones',
		);
		expect(result.links).toContain('osrs/goblin');
		expect(result.links).toContain('osrs/hill-giant');
	});

	it('first edge wins when the same target appears in multiple places', () => {
		const result = osrsExtractor(
			entry({
				osrs: {
					related_items: [
						{ slug: 'iron-ore', relationship: 'related' },
					],
					recipes: [
						{
							product: 'Iron Bar',
							materials: [{ item_name: 'Iron Ore' }],
						},
					],
				},
			}),
			'osrs/coal',
		);
		expect(result.edges?.['osrs/iron-ore']).toBe('related');
	});
});

describe('osrsTagOf', () => {
	it('returns "osrs" only for slugs under osrs/', () => {
		expect(osrsTagOf('osrs/dragon-axe')).toBe('osrs');
		expect(osrsTagOf('osrs/')).toBe('osrs');
		expect(osrsTagOf('gaming/rimworld')).toBe(null);
		expect(osrsTagOf('')).toBe(null);
	});

	it('fuzz: returns "osrs" iff input startsWith "osrs/"', () => {
		fc.assert(
			fc.property(fc.string(), (s) => {
				const tagged = osrsTagOf(s);
				if (s.startsWith('osrs/')) return tagged === 'osrs';
				return tagged === null;
			}),
			{ numRuns: 500 },
		);
	});
});

describe('style lookup tables stay aligned', () => {
	it('every edge color has a matching dash + label', () => {
		const colorKeys = Object.keys(osrsEdgeColors).sort();
		const dashKeys = Object.keys(osrsEdgeDashes).sort();
		const labelKeys = Object.keys(osrsEdgeLabels).sort();
		expect(colorKeys).toEqual(dashKeys);
		expect(colorKeys).toEqual(labelKeys);
	});
});

describe('fuzz — osrsExtractor purity', () => {
	const arbItem = fc.record({
		slug: fc.option(fc.string({ minLength: 1, maxLength: 12 }), {
			nil: undefined,
		}),
		item_name: fc.option(fc.string({ minLength: 1, maxLength: 12 }), {
			nil: undefined,
		}),
		relationship: fc.option(
			fc.constantFrom(
				'upgrade',
				'downgrade',
				'product',
				'component',
				'variant',
				'related',
			),
			{ nil: undefined },
		),
	});

	const arbRecipe = fc.record({
		product: fc.option(fc.string({ minLength: 1, maxLength: 12 }), {
			nil: undefined,
		}),
		materials: fc.option(fc.array(arbItem, { maxLength: 4 }), {
			nil: undefined,
		}),
	});

	const arbOsrs = fc.record({
		related_items: fc.option(fc.array(arbItem, { maxLength: 6 }), {
			nil: undefined,
		}),
		recipes: fc.option(fc.array(arbRecipe, { maxLength: 4 }), {
			nil: undefined,
		}),
	});

	it('never throws and always returns a {links: string[]} shape', () => {
		fc.assert(
			fc.property(arbOsrs, fc.string(), (osrs, slug) => {
				const r = osrsExtractor(entry({ osrs }), slug);
				return (
					Array.isArray(r.links) &&
					r.links.every((l) => typeof l === 'string')
				);
			}),
			{ numRuns: 300 },
		);
	});

	it('current slug is never present in returned links', () => {
		fc.assert(
			fc.property(
				arbOsrs,
				fc.string({ minLength: 1, maxLength: 12 }),
				(osrs, name) => {
					const slug = `osrs/${name}`;
					const r = osrsExtractor(entry({ osrs }), slug);
					return !r.links.includes(slug);
				},
			),
			{ numRuns: 300 },
		);
	});
});
