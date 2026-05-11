import { test, expect } from '@playwright/test';

type IconTerm = {
	ref: string;
	name: string;
	description: string;
	primary_category?: string;
	categories: string[];
	tags: string[];
	styles: string[];
	sourcePacks: string[];
	multiSource: boolean;
	attributionRequired: boolean;
	variantCount: number;
	featured: boolean;
	url: string;
};

type IconCatalog = {
	generatedAt: string;
	count: number;
	terms: IconTerm[];
};

type IconDetail = {
	ref: string;
	name: string;
	title: string;
	description: string;
	categories: string[];
	tags: string[];
	icons: Array<{
		ref: string;
		svg_body: string;
		license?: string;
	}>;
	url: string;
};

type CategoryCatalog = {
	generatedAt: string;
	count: number;
	categories: Array<{
		name: string;
		count: number;
		url: string;
	}>;
};

type SourceCatalog = {
	generatedAt: string;
	count: number;
	sources: Array<{
		name: string;
		termCount: number;
		license: string;
		homeUrl: string;
		attribution: boolean;
	}>;
};

test.describe('RareIcon catalog API', () => {
	test('icons.json exposes stable searchable icon summaries', async ({
		request,
	}) => {
		const response = await request.get('/api/icons.json');
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toContain(
			'application/json',
		);
		expect(response.headers()['cache-control']).toContain('max-age=300');

		const body = (await response.json()) as IconCatalog;
		expect(Date.parse(body.generatedAt)).not.toBeNaN();
		expect(body.count).toBe(body.terms.length);
		expect(body.count).toBeGreaterThan(100);

		const refs = new Set(body.terms.map((term) => term.ref));
		expect(refs.size).toBe(body.terms.length);

		const python = body.terms.find((term) => term.ref === 'python');
		expect(python).toMatchObject({
			ref: 'python',
			multiSource: true,
			featured: true,
		});
		expect(python?.variantCount).toBeGreaterThanOrEqual(2);
		expect(python?.sourcePacks.length).toBeGreaterThanOrEqual(2);
		expect(python?.url).toBe('https://rareicon.com/icons/python/');

		const broadsword = body.terms.find((term) => term.ref === 'broadsword');
		expect(broadsword).toMatchObject({
			ref: 'broadsword',
			attributionRequired: true,
		});
	});

	test('individual icon json contains SVG variants and attribution data', async ({
		request,
	}) => {
		const response = await request.get('/api/icons/python.json/');
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toContain(
			'application/json',
		);

		const body = (await response.json()) as IconDetail;
		expect(body.ref).toBe('python');
		expect(body.url).toBe('https://rareicon.com/icons/python/');
		expect(body.icons.length).toBeGreaterThanOrEqual(2);
		expect(body.icons.every((icon) => icon.svg_body.includes('<svg'))).toBe(
			true,
		);
		expect(
			new Set(body.icons.map((icon) => icon.ref)).size,
		).toBeGreaterThanOrEqual(2);
	});

	test('categories.json is sorted by descending term count', async ({
		request,
	}) => {
		const response = await request.get('/api/categories.json');
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toContain(
			'application/json',
		);

		const body = (await response.json()) as CategoryCatalog;
		expect(body.count).toBe(body.categories.length);
		expect(body.count).toBeGreaterThan(5);

		for (let i = 1; i < body.categories.length; i += 1) {
			expect(body.categories[i - 1].count).toBeGreaterThanOrEqual(
				body.categories[i].count,
			);
		}

		expect(body.categories[0].url).toMatch(
			/^https:\/\/rareicon\.com\/icons\/category\/.+\/$/,
		);
	});

	test('sources.json preserves known license metadata', async ({
		request,
	}) => {
		const response = await request.get('/api/sources.json');
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toContain(
			'application/json',
		);

		const body = (await response.json()) as SourceCatalog;
		expect(body.count).toBe(body.sources.length);
		expect(body.count).toBeGreaterThan(5);

		const sources = new Map(
			body.sources.map((source) => [source.name, source]),
		);
		expect(sources.get('lucide')).toMatchObject({
			license: 'ISC',
			homeUrl: 'https://lucide.dev/',
			attribution: true,
		});
		expect(sources.get('simple-icons')).toMatchObject({
			license: 'CC0',
			attribution: false,
		});
		expect(sources.get('game-icons')).toMatchObject({
			license: 'CC BY 3.0',
			attribution: true,
		});
	});
});
