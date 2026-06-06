export type SchemaNode = Record<string, any>;

const trim = (url: string): string => url.replace(/\/+$/, '');

const abs = (siteUrl: string, path: string): string =>
	/^https?:\/\//.test(path)
		? path
		: `${trim(siteUrl)}/${path.replace(/^\/+/, '')}`;

export const ref = (node: SchemaNode | string): SchemaNode =>
	typeof node === 'string' ? { '@id': node } : { '@id': node['@id'] };

export interface OrgInput {
	url: string;
	name: string;
	logo?: string;
	description?: string;
	sameAs?: string[];
}

export const org = (i: OrgInput): SchemaNode => ({
	'@type': 'Organization',
	'@id': `${trim(i.url)}/#organization`,
	name: i.name,
	url: trim(i.url),
	...(i.logo ? { logo: i.logo } : {}),
	...(i.description ? { description: i.description } : {}),
	...(i.sameAs?.length ? { sameAs: i.sameAs } : {}),
});

export interface WebSiteInput {
	url: string;
	name: string;
	description?: string;
	publisher?: SchemaNode | string;
}

export const website = (i: WebSiteInput): SchemaNode => ({
	'@type': 'WebSite',
	'@id': `${trim(i.url)}/#website`,
	url: trim(i.url),
	name: i.name,
	...(i.description ? { description: i.description } : {}),
	...(i.publisher ? { publisher: ref(i.publisher) } : {}),
});

export interface WebPageInput {
	url: string;
	name: string;
	description?: string;
	image?: string;
	isPartOf?: SchemaNode | string;
	breadcrumb?: SchemaNode | string;
	primaryImageOfPage?: string;
	dateModified?: string;
}

export const webPage = (i: WebPageInput): SchemaNode => ({
	'@type': 'WebPage',
	'@id': `${i.url}#webpage`,
	url: i.url,
	name: i.name,
	...(i.description ? { description: i.description } : {}),
	...(i.image ? { image: i.image } : {}),
	...(i.primaryImageOfPage
		? { primaryImageOfPage: i.primaryImageOfPage }
		: {}),
	...(i.isPartOf ? { isPartOf: ref(i.isPartOf) } : {}),
	...(i.breadcrumb ? { breadcrumb: ref(i.breadcrumb) } : {}),
	...(i.dateModified ? { dateModified: i.dateModified } : {}),
});

export type Crumb = [name: string, path: string];

export const breadcrumbs = (
	siteUrl: string,
	crumbs: Crumb[],
	id?: string,
): SchemaNode => ({
	'@type': 'BreadcrumbList',
	...(id ? { '@id': id } : {}),
	itemListElement: crumbs.map(([name, path], idx) => ({
		'@type': 'ListItem',
		position: idx + 1,
		name,
		item: abs(siteUrl, path),
	})),
});

export interface ListEntry {
	name: string;
	description?: string;
	url?: string;
	image?: string;
}

export const itemList = (
	siteUrl: string,
	entries: ListEntry[],
	opts: { id?: string; name?: string; description?: string } = {},
): SchemaNode => ({
	'@type': 'ItemList',
	...(opts.id ? { '@id': opts.id } : {}),
	...(opts.name ? { name: opts.name } : {}),
	...(opts.description ? { description: opts.description } : {}),
	numberOfItems: entries.length,
	itemListElement: entries.map((e, idx) => ({
		'@type': 'ListItem',
		position: idx + 1,
		name: e.name,
		...(e.description ? { description: e.description } : {}),
		...(e.url ? { url: abs(siteUrl, e.url) } : {}),
		...(e.image ? { image: e.image } : {}),
	})),
});

export interface FaqEntry {
	question: string;
	answer: string;
}

export const faqPage = (entries: FaqEntry[], id?: string): SchemaNode => ({
	'@type': 'FAQPage',
	...(id ? { '@id': id } : {}),
	mainEntity: entries.map((e) => ({
		'@type': 'Question',
		name: e.question,
		acceptedAnswer: { '@type': 'Answer', text: e.answer },
	})),
});

export interface PersonInput {
	url: string;
	name: string;
	image?: string;
	sameAs?: string[];
	description?: string;
}

export const person = (i: PersonInput): SchemaNode => ({
	'@type': 'Person',
	'@id': `${i.url}#person`,
	name: i.name,
	url: i.url,
	...(i.image ? { image: i.image } : {}),
	...(i.description ? { description: i.description } : {}),
	...(i.sameAs?.length ? { sameAs: i.sameAs } : {}),
});

export interface SoftwareAppInput {
	url: string;
	name: string;
	description?: string;
	applicationCategory?: string;
	operatingSystem?: string;
	image?: string;
	offers?: { price: string | number; priceCurrency: string };
}

export const softwareApplication = (i: SoftwareAppInput): SchemaNode => ({
	'@type': 'SoftwareApplication',
	'@id': `${i.url}#software`,
	name: i.name,
	url: i.url,
	...(i.description ? { description: i.description } : {}),
	...(i.applicationCategory
		? { applicationCategory: i.applicationCategory }
		: {}),
	...(i.operatingSystem ? { operatingSystem: i.operatingSystem } : {}),
	...(i.image ? { image: i.image } : {}),
	...(i.offers
		? {
				offers: {
					'@type': 'Offer',
					price: String(i.offers.price),
					priceCurrency: i.offers.priceCurrency,
				},
			}
		: {}),
});

export interface VideoGameInput {
	url: string;
	name: string;
	description?: string;
	image?: string;
	genre?: string | string[];
	gamePlatform?: string | string[];
	publisher?: SchemaNode | string;
	applicationCategory?: string;
}

export const videoGame = (i: VideoGameInput): SchemaNode => ({
	'@type': 'VideoGame',
	'@id': `${i.url}#game`,
	name: i.name,
	url: i.url,
	...(i.description ? { description: i.description } : {}),
	...(i.image ? { image: i.image } : {}),
	...(i.genre ? { genre: i.genre } : {}),
	...(i.gamePlatform ? { gamePlatform: i.gamePlatform } : {}),
	...(i.applicationCategory
		? { applicationCategory: i.applicationCategory }
		: {}),
	...(i.publisher ? { publisher: ref(i.publisher) } : {}),
});

export const dedupeGraph = (nodes: SchemaNode[]): SchemaNode[] => {
	const seen = new Map<string, SchemaNode>();
	const out: SchemaNode[] = [];
	for (const node of nodes) {
		if (!node) continue;
		const id = node['@id'];
		if (typeof id === 'string') {
			if (seen.has(id)) continue;
			seen.set(id, node);
		}
		out.push(node);
	}
	return out;
};
