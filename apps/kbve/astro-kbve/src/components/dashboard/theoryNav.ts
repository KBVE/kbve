import type {
	BreadcrumbCrumb,
	DashboardNavGroup,
	DashboardNavItem,
} from './dashboardNav';
import { buildBreadcrumbIn, isActiveIn } from './dashboardNav';

export const THEORY_ROOT: DashboardNavItem = {
	label: 'Theory',
	href: '/theory/',
};

export const THEORY_NAV: DashboardNavGroup[] = [
	{
		label: 'Engineering & Systems',
		eyebrow: 'Build & preserve',
		href: '/theory/#engineering',
		icon: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
		items: [
			{
				label: 'Programming',
				href: '/theory/programming/',
				copy: 'Notes and resources on the craft of writing code.',
			},
			{
				label: 'Automation',
				href: '/theory/automation/',
				copy: 'Turning manual work into workflows — efficiency, fewer errors, more room to build.',
			},
			{
				label: 'Emulation',
				href: '/theory/emulation/',
				copy: 'A quick reference to the emulator families across the eco-system.',
			},
			{
				label: 'DeadCode',
				href: '/theory/deadcode/',
				copy: 'Learning from archived code — what the graveyard still teaches.',
			},
		],
	},
	{
		label: 'Culture & Society',
		eyebrow: 'Society online',
		href: '/theory/#culture',
		icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
		items: [
			{
				label: 'Social Media Toxicity',
				href: '/theory/socialmedia/',
				copy: 'On the toxicity of social media and steps to reclaim the mind.',
			},
			{
				label: 'SolarPunk',
				href: '/theory/solarpunk/',
				copy: 'A hybrid tech-and-environment movement built on working with nature.',
			},
			{
				label: 'Guerilla Open Access Manifesto',
				href: '/theory/swartz-guerilla-manifesto/',
				copy: 'Aaron Swartz on open access — knowledge belongs to everyone.',
			},
		],
	},
];

export const isTheoryActive = (pathname: string, href: string): boolean =>
	isActiveIn(THEORY_ROOT.href, pathname, href);

export const buildTheoryBreadcrumb = (pathname: string): BreadcrumbCrumb[] =>
	buildBreadcrumbIn(THEORY_NAV, THEORY_ROOT, pathname);
