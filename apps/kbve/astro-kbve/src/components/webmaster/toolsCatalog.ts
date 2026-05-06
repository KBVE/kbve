export type ToolCategory =
	| 'seo'
	| 'performance'
	| 'security'
	| 'dns'
	| 'tech'
	| 'validators';

export interface CategoryMeta {
	id: ToolCategory;
	label: string;
	description: string;
}

export interface WebmasterTool {
	id: string;
	name: string;
	category: ToolCategory;
	popular?: boolean;
	urlTemplate: string;
}

export const CATEGORIES: CategoryMeta[] = [
	{ id: 'seo', label: 'SEO', description: 'Search visibility & rankings' },
	{
		id: 'performance',
		label: 'Performance',
		description: 'Page speed & Core Web Vitals',
	},
	{
		id: 'security',
		label: 'Security',
		description: 'TLS, headers, hardening',
	},
	{ id: 'dns', label: 'DNS / Whois', description: 'Records & ownership' },
	{
		id: 'tech',
		label: 'Tech / Archive',
		description: 'Stack detection & history',
	},
	{
		id: 'validators',
		label: 'Validators',
		description: 'Markup & metadata checks',
	},
];

export const TOOLS: WebmasterTool[] = [
	// --- SEO ---
	{
		id: 'gsc',
		name: 'Google Search Console',
		category: 'seo',
		popular: true,
		urlTemplate:
			'https://search.google.com/search-console?resource_id=sc-domain%3A{ENC}',
	},
	{
		id: 'bing-webmaster',
		name: 'Bing Webmaster',
		category: 'seo',
		popular: true,
		urlTemplate:
			'https://www.bing.com/webmasters/home/mysites?siteUrl=https://{D}/',
	},
	{
		id: 'moz',
		name: 'Moz Domain Analysis',
		category: 'seo',
		popular: true,
		urlTemplate: 'https://moz.com/domain-analysis?site={ENCH}',
	},
	{
		id: 'seoptimer',
		name: 'SEOptimer',
		category: 'seo',
		popular: true,
		urlTemplate: 'https://www.seoptimer.com/{D}',
	},
	{
		id: 'ahrefs',
		name: 'Ahrefs Site Explorer',
		category: 'seo',
		urlTemplate:
			'https://ahrefs.com/site-explorer/overview/v2/exact/recent?target={ENC}',
	},
	{
		id: 'semrush',
		name: 'SEMrush',
		category: 'seo',
		urlTemplate: 'https://www.semrush.com/analytics/overview/?q={ENC}',
	},
	{
		id: 'ubersuggest',
		name: 'Ubersuggest',
		category: 'seo',
		urlTemplate: 'https://neilpatel.com/ubersuggest/?domain={ENC}',
	},
	{
		id: 'similarweb',
		name: 'SimilarWeb',
		category: 'seo',
		urlTemplate: 'https://www.similarweb.com/website/{D}/',
	},

	// --- Performance ---
	{
		id: 'pagespeed',
		name: 'PageSpeed Insights',
		category: 'performance',
		popular: true,
		urlTemplate: 'https://pagespeed.web.dev/analysis?url=https://{D}',
	},
	{
		id: 'gtmetrix',
		name: 'GTmetrix',
		category: 'performance',
		urlTemplate: 'https://gtmetrix.com/?url={ENCH}',
	},
	{
		id: 'webpagetest',
		name: 'WebPageTest',
		category: 'performance',
		urlTemplate: 'https://www.webpagetest.org/?url={ENCH}',
	},

	// --- Security ---
	{
		id: 'ssllabs',
		name: 'SSL Labs',
		category: 'security',
		popular: true,
		urlTemplate: 'https://www.ssllabs.com/ssltest/analyze.html?d={ENC}',
	},
	{
		id: 'security-headers',
		name: 'Security Headers',
		category: 'security',
		popular: true,
		urlTemplate: 'https://securityheaders.com/?q={ENC}&followRedirects=on',
	},
	{
		id: 'observatory',
		name: 'Mozilla Observatory',
		category: 'security',
		urlTemplate: 'https://observatory.mozilla.org/analyze/{D}',
	},
	{
		id: 'hsts-preload',
		name: 'HSTS Preload',
		category: 'security',
		urlTemplate: 'https://hstspreload.org/?domain={ENC}',
	},

	// --- DNS / Whois ---
	{
		id: 'icann',
		name: 'ICANN Lookup',
		category: 'dns',
		urlTemplate: 'https://lookup.icann.org/en/lookup?q={ENC}',
	},
	{
		id: 'dnschecker',
		name: 'DNSChecker',
		category: 'dns',
		urlTemplate: 'https://dnschecker.org/#A/{D}',
	},
	{
		id: 'mxtoolbox',
		name: 'MXToolbox',
		category: 'dns',
		urlTemplate: 'https://mxtoolbox.com/SuperTool.aspx?action=mx%3a{ENC}',
	},
	{
		id: 'intodns',
		name: 'intoDNS',
		category: 'dns',
		urlTemplate: 'https://intodns.com/{D}',
	},

	// --- Tech / Archive ---
	{
		id: 'wayback',
		name: 'Wayback Machine',
		category: 'tech',
		popular: true,
		urlTemplate: 'https://web.archive.org/web/*/{D}',
	},
	{
		id: 'builtwith',
		name: 'BuiltWith',
		category: 'tech',
		urlTemplate: 'https://builtwith.com/{D}',
	},
	{
		id: 'wappalyzer',
		name: 'Wappalyzer',
		category: 'tech',
		urlTemplate: 'https://www.wappalyzer.com/lookup/{D}/',
	},

	// --- Validators ---
	{
		id: 'opengraph',
		name: 'Open Graph Debugger',
		category: 'validators',
		urlTemplate: 'https://www.opengraph.xyz/url/{ENCH}',
	},
	{
		id: 'schema',
		name: 'Schema.org Validator',
		category: 'validators',
		urlTemplate: 'https://validator.schema.org/#url={ENCH}',
	},
	{
		id: 'w3c-html',
		name: 'W3C HTML Validator',
		category: 'validators',
		urlTemplate: 'https://validator.w3.org/nu/?doc={ENCH}',
	},
	{
		id: 'twitter-card',
		name: 'Twitter Card Validator',
		category: 'validators',
		urlTemplate: 'https://cards-dev.twitter.com/validator',
	},
];

export const TOOLS_POPULAR: WebmasterTool[] = TOOLS.filter((t) => t.popular);

export const TOOLS_BY_CATEGORY: Record<ToolCategory, WebmasterTool[]> = (() => {
	const map: Record<ToolCategory, WebmasterTool[]> = {
		seo: [],
		performance: [],
		security: [],
		dns: [],
		tech: [],
		validators: [],
	};
	for (const t of TOOLS) map[t.category].push(t);
	return map;
})();

export const DOMAIN_RE =
	/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63})*\.[a-z]{2,}$/;

export function normalizeDomain(input: string): string {
	return input
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, '')
		.replace(/^www\./, '')
		.replace(/\/.*$/, '')
		.replace(/:\d+$/, '');
}

export function fillTemplate(
	tpl: string,
	d: string,
	enc: string,
	ench: string,
): string {
	return tpl
		.replace(/\{ENCH\}/g, ench)
		.replace(/\{ENC\}/g, enc)
		.replace(/\{D\}/g, d);
}
