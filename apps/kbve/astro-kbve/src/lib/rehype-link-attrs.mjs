/**
 * rehype-link-attrs
 *
 * Rehype plugin that enriches <a> elements produced from markdown/MDX:
 *  - Internal links: adds `data-astro-prefetch`, `aria-label`, `title`
 *  - External links: adds `rel="noopener noreferrer"`, `target="_blank"`,
 *    `aria-label`, `title`
 *
 * An internal link is any href that starts with "/" or is relative (no protocol).
 */

import { visit } from 'unist-util-visit';

/** @param {string} href */
function isExternal(href) {
	return /^https?:\/\//.test(href) || href.startsWith('//');
}

/** @param {string} href */
function isSkippable(href) {
	return (
		!href ||
		href.startsWith('#') ||
		href.startsWith('mailto:') ||
		href.startsWith('tel:') ||
		href.startsWith('javascript:')
	);
}

/**
 * Extract visible text from an element's children (handles nested text nodes).
 * @param {{ children: Array<any> }} node
 * @returns {string}
 */
function getTextContent(node) {
	let text = '';
	for (const child of node.children ?? []) {
		if (child.type === 'text') {
			text += child.value;
		} else if (child.children) {
			text += getTextContent(child);
		}
	}
	return text.trim();
}

/** @type {import('unified').Plugin} */
export default function rehypeLinkAttrs() {
	return (tree) => {
		visit(tree, 'element', (node) => {
			if (node.tagName !== 'a') return;

			const props = node.properties ?? {};
			const href = /** @type {string} */ (props.href ?? '');

			if (isSkippable(href)) return;

			const linkText = getTextContent(node);

			if (isExternal(href)) {
				// External link enrichment
				props.rel = 'noopener noreferrer';
				props.target = '_blank';

				if (!props.title) {
					props.title = linkText
						? `${linkText} (opens in new tab)`
						: 'External link (opens in new tab)';
				}
				if (!props['aria-label']) {
					props['aria-label'] = linkText
						? `${linkText} (opens in new tab)`
						: 'External link';
				}
			} else {
				// Internal link enrichment
				props['data-astro-prefetch'] = '';

				if (!props.title) {
					props.title = linkText || href;
				}
				if (!props['aria-label']) {
					props['aria-label'] = linkText
						? `Navigate to ${linkText}`
						: `Navigate to ${href}`;
				}
			}

			node.properties = props;
		});
	};
}
