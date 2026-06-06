import { createSeo } from '@kbve/astro/seo';

export const seo = createSeo({
	siteUrl: 'https://kbve.com',
	name: 'KBVE',
	description:
		'KiloByte Virtual Enterprise — building, shipping, and hosting games and software in the open.',
	logo: 'https://kbve.com/assets/images/brand/letter_logo.png',
	sameAs: [
		'https://github.com/kbve',
		'https://discord.gg/kbve',
		'https://kbve.com/discord/',
	],
});

export * from '@kbve/astro/seo';
