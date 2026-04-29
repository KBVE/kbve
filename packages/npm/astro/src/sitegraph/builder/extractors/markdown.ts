import type { Extractor } from '../../types';

const MD_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;
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
 * Extracts internal markdown links from `entry.body`.
 *
 * Skips external (`http`), anchor-only (`#`), `mailto:`, and asset links.
 * Normalizes `/docs/` prefix, leading/trailing slashes, file extensions,
 * and hash fragments.
 */
export const markdownExtractor: Extractor = (entry, currentSlug) => {
	const body = entry.body;
	if (!body) return { links: [] };

	const links = new Set<string>();
	let match: RegExpExecArray | null;
	MD_LINK_RE.lastIndex = 0;

	while ((match = MD_LINK_RE.exec(body)) !== null) {
		const href = match[2].trim();
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
