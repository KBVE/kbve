import type {
	BreadcrumbCrumb,
	DashboardNavEntry,
	DashboardNavGroup,
	DashboardNavItem,
} from './dashboardNav';

export interface StarlightLink {
	type: 'link';
	label: string;
	href: string;
	isCurrent: boolean;
}

export interface StarlightGroup {
	type: 'group';
	label: string;
	entries: StarlightEntry[];
	collapsed?: boolean;
}

export type StarlightEntry = StarlightLink | StarlightGroup;

export interface GutterShell {
	entries: DashboardNavEntry[];
	root: DashboardNavItem;
	navLabel: string;
	crumbs: BreadcrumbCrumb[];
}

const isGroup = (entry: StarlightEntry): entry is StarlightGroup =>
	entry.type === 'group';

const hasCurrent = (entry: StarlightEntry): boolean =>
	isGroup(entry) ? entry.entries.some(hasCurrent) : entry.isCurrent;

const firstLink = (entry: StarlightEntry): StarlightLink | undefined => {
	if (!isGroup(entry)) return entry;
	for (const child of entry.entries) {
		const link = firstLink(child);
		if (link) return link;
	}
	return undefined;
};

const landingHref = (group: StarlightGroup): string =>
	firstLink(group)?.href ?? '/';

const flattenLinks = (entry: StarlightEntry): StarlightLink[] =>
	isGroup(entry) ? entry.entries.flatMap(flattenLinks) : [entry];

const toItem = (link: StarlightLink): DashboardNavItem => ({
	label: link.label,
	href: link.href,
});

const toGroup = (group: StarlightGroup): DashboardNavGroup => ({
	label: group.label,
	href: landingHref(group),
	items: flattenLinks(group).map(toItem),
});

const sectionEntries = (section: StarlightGroup): DashboardNavEntry[] => {
	const entries: DashboardNavEntry[] = [];
	const loose: DashboardNavItem[] = [];
	for (const child of section.entries) {
		if (isGroup(child)) entries.push(toGroup(child));
		else loose.push(toItem(child));
	}
	if (loose.length) {
		entries.unshift({
			label: section.label,
			href: landingHref(section),
			items: loose,
		});
	}
	return entries;
};

const currentPath = (section: StarlightGroup): StarlightGroup[] => {
	const path: StarlightGroup[] = [];
	const walk = (group: StarlightGroup): boolean => {
		for (const child of group.entries) {
			if (isGroup(child) && hasCurrent(child)) {
				path.push(child);
				walk(child);
				return true;
			}
		}
		return false;
	};
	walk(section);
	return path;
};

const currentLink = (section: StarlightGroup): StarlightLink | undefined => {
	const stack: StarlightEntry[] = [section];
	while (stack.length) {
		const entry = stack.pop()!;
		if (isGroup(entry)) stack.push(...entry.entries);
		else if (entry.isCurrent) return entry;
	}
	return undefined;
};

const normalize = (path: string): string => {
	const trimmed = path.split('?')[0].split('#')[0];
	return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
};

const isNavGroup = (entry: DashboardNavEntry): entry is DashboardNavGroup =>
	Array.isArray((entry as DashboardNavGroup).items);

const toStarlightLink = (
	item: DashboardNavItem,
	pathname: string,
): StarlightLink => ({
	type: 'link',
	label: item.label,
	href: item.href,
	isCurrent: normalize(item.href) === normalize(pathname),
});

/**
 * Map a hand-authored nav module onto Starlight's sidebar shape so the route
 * middleware can hand it back to the real sidebar slot. Inverse of
 * `adaptStarlightSidebar`; visibility/icon metadata is carried separately by
 * the section shell, which the sidebar component reads from locals.
 */
export const toStarlightEntries = (
	entries: DashboardNavEntry[],
	pathname: string,
	collapsible = true,
): StarlightEntry[] =>
	entries.map((entry) =>
		isNavGroup(entry)
			? ({
					type: 'group',
					label: entry.label,
					collapsed:
						collapsible &&
						!entry.items.some(
							(item) =>
								normalize(item.href) === normalize(pathname),
						),
					icon: entry.icon,
					href: entry.href,
					entries: entry.items.map((item) =>
						toStarlightLink(item, pathname),
					),
				} as StarlightGroup)
			: toStarlightLink(entry, pathname),
	);

/**
 * Map a Starlight route sidebar (`Astro.locals.starlightRoute.sidebar`) onto the
 * bento gutter's nav shape. Reads only Starlight's plain data — no Starlight
 * markup, so the shell keeps full styling control. Returns null when the route
 * has no active entry (caller falls back to a hand-authored nav module).
 */
export const adaptStarlightSidebar = (
	sidebar: StarlightEntry[],
	pathname: string,
): GutterShell | null => {
	const top = sidebar.find((entry) => isGroup(entry) && hasCurrent(entry)) as
		| StarlightGroup
		| undefined;
	if (!top) return null;

	const activeChild = top.entries.find(
		(entry) => isGroup(entry) && hasCurrent(entry),
	) as StarlightGroup | undefined;
	const section = activeChild ?? top;

	const root: DashboardNavItem = {
		label: section.label,
		href: landingHref(section),
	};

	const crumbs: BreadcrumbCrumb[] = [
		{ label: top.label, href: landingHref(top) },
	];
	if (activeChild) {
		crumbs.push({ label: section.label, href: landingHref(section) });
	}
	for (const group of currentPath(section)) {
		crumbs.push({ label: group.label, href: landingHref(group) });
	}
	const leaf = currentLink(section);
	if (
		leaf &&
		!crumbs.some((crumb) => normalize(crumb.href) === normalize(leaf.href))
	) {
		crumbs.push({ label: leaf.label, href: leaf.href });
	}

	return {
		entries: sectionEntries(section),
		root,
		navLabel: section.label,
		crumbs,
	};
};
