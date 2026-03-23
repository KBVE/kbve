import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
	site: 'https://chuckrpg.com',
	output: 'static',
	trailingSlash: 'always',
	outDir: '../../../dist/apps/astro-chuckrpg',
	prefetch: true,
	integrations: [
		starlight({
			title: 'ChuckRPG',
			defaultLocale: 'root',
			locales: {
				root: {
					label: 'English',
					lang: 'en',
				},
			},
			sidebar: [
				{
					label: 'Getting Started',
					autogenerate: { directory: 'guides' },
				},
				{
					label: 'Game',
					autogenerate: { directory: 'game' },
				},
			],
		}),
		react(),
		sitemap(),
	],
	vite: {
		plugins: [tailwindcss()],
	},
});
