/**
 * Single source of truth for RareIcon outbound social links.
 *
 * Consumed by:
 *   - SocialBar.astro (badge row + Kingdom nav)
 *   - Press kit page
 *   - Steam splash CTAs
 *
 * Each entry's `href` routes through kbve.com/* so backlinks compound to
 * the in-house SEO target (kbve.com landing page) instead of the
 * external platform — see project memory: "keep SEO juice in house".
 */

export type Social = {
	platform: string;
	label: string;
	href: string;
	/** Optional override — defaults to `_blank` for external, `_self` for internal */
	target?: '_blank' | '_self';
	/** Hex color used for badge hover ring + theme accent */
	color: string;
};

export const SOCIALS: Social[] = [
	{
		platform: 'steam',
		label: 'Steam',
		href: '/steam/',
		target: '_self',
		color: '#66c0f4',
	},
	{
		platform: 'github',
		label: 'GitHub',
		href: 'https://kbve.com/github/',
		color: '#6e5494',
	},
	{
		platform: 'discord',
		label: 'Discord',
		href: 'https://kbve.com/discord/',
		color: '#5865f2',
	},
	{
		platform: 'youtube',
		label: 'YouTube',
		href: 'https://kbve.com/youtube/',
		color: '#ff0000',
	},
	{
		platform: 'twitch',
		label: 'Twitch',
		href: 'https://kbve.com/twitch/',
		color: '#9146ff',
	},
	{
		platform: 'twitter',
		label: 'Twitter / X',
		href: 'https://kbve.com/twitter/',
		color: '#1d9bf0',
	},
	{
		platform: 'bluesky',
		label: 'Bluesky',
		href: 'https://kbve.com/bluesky/',
		color: '#0085ff',
	},
	{
		platform: 'tiktok',
		label: 'TikTok',
		href: 'https://kbve.com/tiktok/',
		color: '#ff0050',
	},
	{
		platform: 'itch',
		label: 'itch.io',
		href: 'https://kbve.com/itch/',
		color: '#fa5c5c',
	},
];
