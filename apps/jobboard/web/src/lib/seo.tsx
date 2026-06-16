import { useEffect } from 'react';
import {
	buildSeo,
	graph,
	organization,
	website,
	type SchemaNode,
	type SeoInput,
} from '@kbve/core';

export const SITE_URL = 'https://jobs.kbve.com';
export const SITE_NAME = 'KBVE Jobs';

const ORG_ID = `${SITE_URL}/#org`;
const SITE_ID = `${SITE_URL}/#website`;

export const abs = (path: string): string =>
	path.startsWith('http') ? path : `${SITE_URL}${path}`;

/** OG image served by the Axum /og route (dynamic SVG). */
export const ogImage = (type: string, id: string): string =>
	`${SITE_URL}/og/${type}/${encodeURIComponent(id)}.svg`;

const siteNodes = (): SchemaNode[] => [
	organization({
		id: ORG_ID,
		name: SITE_NAME,
		url: SITE_URL,
		logo: `${SITE_URL}/icon.svg`,
		sameAs: ['https://kbve.com', 'https://github.com/KBVE'],
	}),
	website({ id: SITE_ID, name: SITE_NAME, url: SITE_URL, publisher: ORG_ID }),
];

// Tiny CSR head manager — no react-helmet (peers react 18; app is react 19).
// Each render clears prior [data-seo] tags and writes fresh ones, so route
// changes swap meta cleanly. Crawlers that run JS (Google, Discord, Slack,
// Twitter) pick these up; for JS-less crawlers, pair with server-side
// injection later.
function applyHead(
	title: string,
	canonical: string,
	metas: { name?: string; property?: string; content: string }[],
	jsonLd: SchemaNode,
) {
	document.title = title;
	document.querySelectorAll('[data-seo]').forEach((el) => el.remove());
	const head = document.head;

	const link = document.createElement('link');
	link.rel = 'canonical';
	link.href = canonical;
	link.setAttribute('data-seo', '');
	head.appendChild(link);

	for (const m of metas) {
		const el = document.createElement('meta');
		if (m.property) el.setAttribute('property', m.property);
		else if (m.name) el.setAttribute('name', m.name);
		el.setAttribute('content', m.content);
		el.setAttribute('data-seo', '');
		head.appendChild(el);
	}

	const script = document.createElement('script');
	script.type = 'application/ld+json';
	script.textContent = JSON.stringify(jsonLd);
	script.setAttribute('data-seo', '');
	head.appendChild(script);
}

export function Seo({
	seo,
	jsonLd,
}: {
	seo: Omit<SeoInput, 'url'> & { path: string };
	jsonLd?: SchemaNode[];
}) {
	const { path, ...rest } = seo;
	const result = buildSeo({
		...rest,
		url: abs(path),
		siteName: SITE_NAME,
		twitterSite: '@kbve',
	});
	const doc = graph([...siteNodes(), ...(jsonLd ?? [])]);

	useEffect(() => {
		applyHead(result.title, result.canonical, result.meta, doc);
		// re-run when the page identity changes
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [result.title, result.canonical, JSON.stringify(doc)]);

	return null;
}
