// Framework-agnostic schema.org / JSON-LD builders (pure data, no deps).
// Mirrors the shapes used by @kbve/astro/seo so web (jobboard) + astro stay
// consistent. Builders return plain objects; render them as
// <script type="application/ld+json"> (see the web <JsonLd> wrapper).

export type SchemaNode = Record<string, unknown>;

export const ref = (id: string): SchemaNode => ({ '@id': id });

export interface OrgInput {
	id: string;
	name: string;
	url: string;
	logo?: string;
	sameAs?: string[];
}

export const organization = (i: OrgInput): SchemaNode => ({
	'@type': 'Organization',
	'@id': i.id,
	name: i.name,
	url: i.url,
	...(i.logo ? { logo: i.logo } : {}),
	...(i.sameAs?.length ? { sameAs: i.sameAs } : {}),
});

export interface WebSiteInput {
	id: string;
	name: string;
	url: string;
	publisher?: string;
}

export const website = (i: WebSiteInput): SchemaNode => ({
	'@type': 'WebSite',
	'@id': i.id,
	name: i.name,
	url: i.url,
	...(i.publisher ? { publisher: ref(i.publisher) } : {}),
});

export type Crumb = [name: string, url: string];

export const breadcrumbList = (crumbs: Crumb[]): SchemaNode => ({
	'@type': 'BreadcrumbList',
	itemListElement: crumbs.map(([name, url], idx) => ({
		'@type': 'ListItem',
		position: idx + 1,
		name,
		item: url,
	})),
});

export interface PersonInput {
	id?: string;
	name: string;
	url?: string;
	image?: string;
	jobTitle?: string;
	sameAs?: string[];
}

export const person = (i: PersonInput): SchemaNode => ({
	'@type': 'Person',
	...(i.id ? { '@id': i.id } : {}),
	name: i.name,
	...(i.url ? { url: i.url } : {}),
	...(i.image ? { image: i.image } : {}),
	...(i.jobTitle ? { jobTitle: i.jobTitle } : {}),
	...(i.sameAs?.length ? { sameAs: i.sameAs } : {}),
});

export interface JobPostingInput {
	title: string;
	description: string;
	url: string;
	datePosted?: string;
	validThrough?: string;
	employmentType?: string;
	hiringOrganization?: { name: string; url?: string };
	/** Minor units (e.g. cents). Omit for "undisclosed". */
	salaryMin?: number;
	salaryMax?: number;
	currency?: string;
	remote?: boolean;
	location?: string;
}

export const jobPosting = (i: JobPostingInput): SchemaNode => ({
	'@type': 'JobPosting',
	title: i.title,
	description: i.description,
	url: i.url,
	...(i.datePosted ? { datePosted: i.datePosted } : {}),
	...(i.validThrough ? { validThrough: i.validThrough } : {}),
	...(i.employmentType ? { employmentType: i.employmentType } : {}),
	...(i.hiringOrganization
		? {
				hiringOrganization: {
					'@type': 'Organization',
					name: i.hiringOrganization.name,
					...(i.hiringOrganization.url
						? { sameAs: i.hiringOrganization.url }
						: {}),
				},
			}
		: {}),
	...(i.salaryMin !== undefined && i.currency
		? {
				baseSalary: {
					'@type': 'MonetaryAmount',
					currency: i.currency,
					value: {
						'@type': 'QuantitativeValue',
						minValue: i.salaryMin,
						...(i.salaryMax !== undefined
							? { maxValue: i.salaryMax }
							: {}),
						unitText: 'MONTH',
					},
				},
			}
		: {}),
	...(i.remote
		? { jobLocationType: 'TELECOMMUTE' }
		: i.location
			? {
					jobLocation: {
						'@type': 'Place',
						address: i.location,
					},
				}
			: {}),
});

export interface ListItemRef {
	name: string;
	url: string;
}

export const itemList = (items: ListItemRef[]): SchemaNode => ({
	'@type': 'ItemList',
	itemListElement: items.map((it, idx) => ({
		'@type': 'ListItem',
		position: idx + 1,
		name: it.name,
		url: it.url,
	})),
});

/** Wrap nodes into a single @graph document, de-duplicated by @id. */
export const graph = (nodes: SchemaNode[]): SchemaNode => {
	const seen = new Map<string, SchemaNode>();
	const out: SchemaNode[] = [];
	for (const n of nodes) {
		const id = n['@id'] as string | undefined;
		if (id) {
			if (seen.has(id)) continue;
			seen.set(id, n);
		}
		out.push(n);
	}
	return { '@context': 'https://schema.org', '@graph': out };
};
