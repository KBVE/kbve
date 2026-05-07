/**
 * Single source of truth for KBVE outbound social links.
 *
 * Consumed by:
 *   - AstroFooter.astro bottom bar (badge icons + SocialTooltip popovers)
 *   - any future page that wants to render the canonical social rail
 *
 * Hrefs route through `kbve.com/*` even when KBVE owns both ends so the
 * link analytics pipeline can attribute traffic without per-platform
 * deep links rotting through the codebase.
 */

export type Social = {
	platform: string;
	title: string;
	href: string;
	description: string;
	badge: string;
	ringColor: string;
};

export const SOCIALS: Social[] = [
	{
		platform: 'github',
		title: 'GitHub',
		href: 'https://kbve.com/github',
		description:
			'Explore our open-source repositories and contribute to the project.',
		badge: 'Open Source',
		ringColor: '#6e5494',
	},
	{
		platform: 'discord',
		title: 'Discord',
		href: 'https://kbve.com/discord',
		description:
			'Join our community to chat, get support, and stay updated.',
		badge: 'Community',
		ringColor: '#5865F2',
	},
	{
		platform: 'youtube',
		title: 'YouTube',
		href: 'https://kbve.com/youtube',
		description: 'Watch devlogs, tutorials, and project showcases.',
		badge: 'Video',
		ringColor: '#FF0000',
	},
	{
		platform: 'twitch',
		title: 'Twitch',
		href: 'https://kbve.com/twitch',
		description:
			'Catch live coding, playtests, and behind-the-scenes streams.',
		badge: 'Live',
		ringColor: '#9146FF',
	},
	{
		platform: 'twitter',
		title: 'Twitter / X',
		href: 'https://kbve.com/twitter',
		description: 'Project updates, dev snippets, and release pings.',
		badge: 'Updates',
		ringColor: '#1d9bf0',
	},
	{
		platform: 'bluesky',
		title: 'Bluesky',
		href: 'https://kbve.com/bluesky',
		description:
			'Follow on the AT Protocol — decentralized social, same crew.',
		badge: 'Decentralized',
		ringColor: '#0085ff',
	},
	{
		platform: 'tiktok',
		title: 'TikTok',
		href: 'https://kbve.com/tiktok',
		description: 'Short-form gamedev highlights and devlog snippets.',
		badge: 'Shorts',
		ringColor: '#ff0050',
	},
	{
		platform: 'itch',
		title: 'itch.io',
		href: 'https://kbve.com/itch',
		description: 'Indie demos, jam entries, and ship-when-ready projects.',
		badge: 'Indie',
		ringColor: '#fa5c5c',
	},
	{
		platform: 'steam',
		title: 'Steam',
		href: 'https://kbve.com/steam',
		description: 'Wishlist KBVE games on Steam — RareIcon and more.',
		badge: 'Games',
		ringColor: '#66c0f4',
	},
];
