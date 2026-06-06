import {
	org,
	website,
	webPage,
	article,
	breadcrumbs,
	itemList,
	faqPage,
	type SchemaNode,
	type WebPageInput,
	type Crumb,
	type ListEntry,
	type FaqEntry,
} from './schema.js';

export * from './schema.js';

export interface SeoSiteConfig {
	siteUrl: string;
	name: string;
	logo?: string;
	description?: string;
	sameAs?: string[];
}

export interface PageInput {
	pathname: string;
	title: string;
	description?: string;
	type?: 'WebPage' | 'Article';
	image?: string;
	datePublished?: string;
	dateModified?: string;
	keywords?: string[];
	breadcrumb?: Crumb[];
	faq?: FaqEntry[];
	extra?: SchemaNode[];
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
	page(i: PageInput): SchemaNode[];
}

const humanize = (segment: string): string =>
	segment.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const autoCrumbs = (siteName: string, pathname: string): Crumb[] => {
	const segs = pathname.split('/').filter(Boolean);
	const crumbs: Crumb[] = [[siteName, '/']];
	let acc = '';
	for (const seg of segs) {
		acc += `/${seg}`;
		crumbs.push([humanize(seg), `${acc}/`]);
	}
	return crumbs;
};

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
		page: (i) => {
			const pageUrl = abs(config.siteUrl, i.pathname);
			const crumbId = `${pageUrl}#breadcrumb`;
			const trail = i.breadcrumb ?? autoCrumbs(config.name, i.pathname);
			const crumb = breadcrumbs(config.siteUrl, trail, crumbId);
			const primary =
				i.type === 'Article'
					? article({
							url: pageUrl,
							headline: i.title,
							description: i.description,
							image: i.image ?? config.logo,
							datePublished: i.datePublished,
							dateModified: i.dateModified,
							keywords: i.keywords,
							publisher: orgNode,
							isPartOf: siteNode,
							breadcrumb: crumbId,
						})
					: webPage({
							url: pageUrl,
							name: i.title,
							description: i.description,
							image: i.image,
							primaryImageOfPage: i.image ?? config.logo,
							keywords: i.keywords,
							isPartOf: siteNode,
							breadcrumb: crumbId,
							dateModified: i.dateModified,
						});
			const nodes: SchemaNode[] = [orgNode, siteNode, primary, crumb];
			if (i.faq?.length) nodes.push(faqPage(i.faq, `${pageUrl}#faq`));
			if (i.extra?.length) nodes.push(...i.extra);
			return nodes;
		},
	};
};
