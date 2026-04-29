import type { Extractor } from '../../types';

const JSX_HREF_RE = /<a\s[^>]*href=["']([^"']+)["'][^>]*>/g;
const ASSET_RE = /\.(png|jpg|jpeg|gif|svg|webp|pdf|zip)$/i;

function normalizeSlug(href: string): string {
	return href
		.replace(/^\/docs\//, '')
		.replace(/^\//, '')
		.replace(/\/$/, '')
		.replace(/\.mdx?$/, '')
		.replace(/#.*$/, '');
}

/**
 * Extracts internal JSX anchor links (`<a href="...">`) from `entry.body`.
 *
 * Complements `markdownExtractor` for MDX pages that mix markdown with raw
 * JSX. Same skip + normalization rules as the markdown extractor.
 */
export const mdxAnchorExtractor: Extractor = (entry, currentSlug) => {
	const body = entry.body;
	if (!body) return { links: [] };

	const links = new Set<string>();
	let match: RegExpExecArray | null;
	JSX_HREF_RE.lastIndex = 0;

	while ((match = JSX_HREF_RE.exec(body)) !== null) {
		const href = match[1].trim();
		if (
			href.startsWith('http') ||
			href.startsWith('#') ||
			href.startsWith('mailto:') ||
			ASSET_RE.test(href)
		) {
			continue;
		}
		const slug = normalizeSlug(href);
		if (slug && slug !== currentSlug) {
			links.add(slug);
		}
	}

	return { links: [...links] };
};
