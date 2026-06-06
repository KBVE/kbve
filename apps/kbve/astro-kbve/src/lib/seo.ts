import { createSeo } from '@kbve/astro/seo';

export const seo = createSeo({
	siteUrl: 'https://kbve.com',
	name: 'KBVE',
	alternateName: 'KiloByte Virtual Enterprise',
	description:
		'KiloByte Virtual Enterprise — building, shipping, and hosting games and software in the open.',
	logo: 'https://kbve.com/assets/images/brand/letter_logo.png',
	logoWidth: 150,
	logoHeight: 48,
	email: 'hello@kbve.com',
	contactType: 'customer support',
	brand: 'KBVE',
	inLanguage: 'en',
	sameAs: [
		'https://github.com/kbve',
		'https://discord.gg/kbve',
		'https://kbve.com/discord/',
	],
});

export * from '@kbve/astro/seo';
