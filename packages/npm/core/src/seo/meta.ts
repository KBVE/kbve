// Framework-agnostic social-embed / <meta> builder. Returns a flat list of tag
// descriptors; a renderer (web <Seo> via react-helmet, or an SSR template)
// turns them into <meta>/<title>/<link> elements.

export interface MetaTag {
	/** <meta name="..."> */
	name?: string;
	/** <meta property="..."> (Open Graph) */
	property?: string;
	content: string;
}

export interface SeoInput {
	title: string;
	description: string;
	/** Canonical absolute URL. */
	url: string;
	/** Absolute OG image URL (e.g. the axum /og/*.svg route). */
	image?: string;
	siteName?: string;
	type?: 'website' | 'article' | 'profile';
	twitterCard?: 'summary' | 'summary_large_image';
	twitterSite?: string;
	noindex?: boolean;
}

export interface SeoResult {
	title: string;
	canonical: string;
	meta: MetaTag[];
}

export function buildSeo(i: SeoInput): SeoResult {
	const meta: MetaTag[] = [
		{ name: 'description', content: i.description },
		{ property: 'og:title', content: i.title },
		{ property: 'og:description', content: i.description },
		{ property: 'og:url', content: i.url },
		{ property: 'og:type', content: i.type ?? 'website' },
		...(i.siteName
			? [{ property: 'og:site_name', content: i.siteName }]
			: []),
		...(i.image ? [{ property: 'og:image', content: i.image }] : []),
		{
			name: 'twitter:card',
			content:
				i.twitterCard ?? (i.image ? 'summary_large_image' : 'summary'),
		},
		{ name: 'twitter:title', content: i.title },
		{ name: 'twitter:description', content: i.description },
		...(i.image ? [{ name: 'twitter:image', content: i.image }] : []),
		...(i.twitterSite
			? [{ name: 'twitter:site', content: i.twitterSite }]
			: []),
		...(i.noindex ? [{ name: 'robots', content: 'noindex' }] : []),
	];
	return { title: i.title, canonical: i.url, meta };
}
