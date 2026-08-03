import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import type { MarkdownHeading } from 'astro';
import { resolveSection } from '@/components/dashboard/sectionNav';
import { toStarlightEntries } from '@/components/dashboard/starlightNav';
import type { StarlightEntry } from '@/components/dashboard/starlightNav';

interface TocItem extends MarkdownHeading {
	children: TocItem[];
}

const PAGE_TITLE_ID = '_top';

const injectChild = (items: TocItem[], item: TocItem): void => {
	const last = items.at(-1);
	if (!last || last.depth >= item.depth) items.push(item);
	else injectChild(last.children, item);
};

const buildToc = (headings: MarkdownHeading[]) => {
	const min = 2;
	const max = 3;
	const items: TocItem[] = [
		{ depth: 2, slug: PAGE_TITLE_ID, text: 'Overview', children: [] },
	];
	for (const heading of headings) {
		if (heading.depth < min || heading.depth > max) continue;
		injectChild(items, { ...heading, children: [] });
	}
	return { minHeadingLevel: min, maxHeadingLevel: max, items };
};

/**
 * Hands section pages back a real Starlight sidebar. `template: splash` only
 * sets `hasSidebar: false` and drops the ToC, so restoring both here lets a
 * full-bleed bento page keep the sidebar pane instead of re-implementing one
 * inside the content column.
 */
export const onRequest = defineRouteMiddleware(async (context) => {
	const route = context.locals.starlightRoute;
	if (!route) return;

	const section = await resolveSection(
		context.url.pathname,
		route.sidebar as StarlightEntry[],
	);
	if (!section) return;

	context.locals.kbveSection = section;
	route.hasSidebar = true;
	route.sidebar = toStarlightEntries(
		section.entries,
		context.url.pathname,
		section.collapsible,
	) as typeof route.sidebar;
	route.pagination = { prev: undefined, next: undefined };

	if (section.withToc && !route.toc) {
		route.toc = buildToc(route.headings ?? []);
	}
	if (!section.withToc) {
		route.toc = undefined;
	}
});
