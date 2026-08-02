import type {
	BreadcrumbCrumb,
	DashboardNavEntry,
	DashboardNavItem,
} from '../dashboard/dashboardNav';
import { findActiveIn, isActiveIn } from '../dashboard/dashboardNav';

export const COMMUNITY_ROOT: DashboardNavItem = {
	label: 'Community',
	href: '/github/',
};

export const COMMUNITY_NAV: DashboardNavEntry[] = [
	{
		label: 'Open source',
		eyebrow: 'Code',
		icon: 'M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22',
		items: [
			{ label: 'GitHub', href: '/github/' },
			{ label: 'Projects', href: '/projects/' },
			{ label: 'Graph', href: '/graph/' },
		],
	},
	{
		label: 'Chat',
		eyebrow: 'Talk to us',
		icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
		items: [
			{ label: 'Discord', href: '/discord/' },
			{ label: 'Chat', href: '/chat/' },
			{ label: 'Twitch', href: '/twitch/' },
		],
	},
	{
		label: 'Social',
		eyebrow: 'Follow along',
		icon: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98',
		items: [
			{ label: 'Bluesky', href: '/bluesky/' },
			{ label: 'X / Twitter', href: '/twitter/' },
			{ label: 'YouTube', href: '/youtube/' },
			{ label: 'TikTok', href: '/tiktok/' },
		],
	},
	{
		label: 'Games',
		eyebrow: 'Play our stuff',
		icon: 'M6 12h4m-2-2v4m7-1h.01M18 11h.01M17.32 5H6.68a4 4 0 0 0-3.98 3.6l-.6 6A4 4 0 0 0 6.08 19c1.2 0 2.32-.53 3.08-1.45L10 16.5h4l.84 1.05A4 4 0 0 0 17.92 19a4 4 0 0 0 3.98-4.4l-.6-6A4 4 0 0 0 17.32 5z',
		items: [
			{ label: 'itch.io', href: '/itch/' },
			{ label: 'Steam', href: '/steam/' },
		],
	},
	{
		label: 'Support',
		eyebrow: 'Back the work',
		icon: 'M4.32 6.32a4.5 4.5 0 0 0 0 6.36L12 20.36l7.68-7.68a4.5 4.5 0 0 0-6.36-6.36L12 7.64l-1.32-1.32a4.5 4.5 0 0 0-6.36 0z',
		items: [
			{ label: 'Donate', href: '/donate/' },
			{ label: 'About', href: '/about/' },
			{ label: 'Register', href: '/register/' },
		],
	},
];

export const isCommunityActive = (pathname: string, href: string): boolean =>
	isActiveIn(COMMUNITY_ROOT.href, pathname, href);

/**
 * The root href is /github/, so the shared builder would swallow the GitHub
 * crumb as "the root itself". Always emit Community › Group › Page instead.
 */
export const buildCommunityBreadcrumb = (
	pathname: string,
): BreadcrumbCrumb[] => {
	const crumbs: BreadcrumbCrumb[] = [COMMUNITY_ROOT];
	const match = findActiveIn(COMMUNITY_NAV, COMMUNITY_ROOT.href, pathname);
	if (!match) return crumbs;
	if (match.group) {
		crumbs.push({
			label: match.group.label,
			href: match.group.href ?? match.item.href,
		});
	}
	crumbs.push({ label: match.item.label, href: match.item.href });
	return crumbs;
};
