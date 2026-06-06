import {
	org,
	website,
	webPage,
	breadcrumbs,
	itemList,
	type SchemaNode,
	type WebPageInput,
	type Crumb,
	type ListEntry,
} from './schema.js';

export * from './schema.js';

export interface SeoSiteConfig {
	siteUrl: string;
	name: string;
	logo?: string;
	description?: string;
	sameAs?: string[];
}

export interface Seo {
	config: SeoSiteConfig;
	org: SchemaNode;
	website: SchemaNode;
	url(path: string): string;
	webPage(
		i: Omit<WebPageInput, 'isPartOf'> & {
			isPartOf?: WebPageInput['isPartOf'];
		},
	): SchemaNode;
	breadcrumbs(crumbs: Crumb[], id?: string): SchemaNode;
	itemList(
		entries: ListEntry[],
		opts?: { id?: string; name?: string; description?: string },
	): SchemaNode;
	graph(...nodes: SchemaNode[]): SchemaNode[];
}

const trim = (url: string): string => url.replace(/\/+$/, '');

const abs = (siteUrl: string, path: string): string =>
	/^https?:\/\//.test(path)
		? path
		: `${trim(siteUrl)}/${path.replace(/^\/+/, '')}`;

export const createSeo = (config: SeoSiteConfig): Seo => {
	const orgNode = org({
		url: config.siteUrl,
		name: config.name,
		logo: config.logo,
		description: config.description,
		sameAs: config.sameAs,
	});
	const siteNode = website({
		url: config.siteUrl,
		name: config.name,
		description: config.description,
		publisher: orgNode,
	});

	return {
		config,
		org: orgNode,
		website: siteNode,
		url: (path) => abs(config.siteUrl, path),
		webPage: (i) =>
			webPage({
				...i,
				isPartOf: i.isPartOf ?? siteNode,
			}),
		breadcrumbs: (crumbs, id) => breadcrumbs(config.siteUrl, crumbs, id),
		itemList: (entries, opts) => itemList(config.siteUrl, entries, opts),
		graph: (...nodes) => [orgNode, siteNode, ...nodes],
	};
};
