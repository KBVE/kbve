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
			customCss: ['./src/styles/global.css'],
			components: {
				PageTitle: './src/components/starlight/PageTitle.astro',
				Footer: './src/components/starlight/Footer.astro',
			},
			head: [
				{
					tag: 'link',
					attrs: {
						rel: 'preconnect',
						href: 'https://fonts.googleapis.com',
					},
				},
				{
					tag: 'link',
					attrs: {
						rel: 'preconnect',
						href: 'https://fonts.gstatic.com',
						crossorigin: true,
					},
				},
				{
					tag: 'link',
					attrs: {
						rel: 'stylesheet',
						href: 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Lora:ital,wght@0,400;0,600;1,400&display=swap',
					},
				},
			],
			sidebar: [
				{
					label: 'Getting Started',
					autogenerate: { directory: 'guides' },
				},
				{
					label: 'Game',
					autogenerate: { directory: 'game' },
				},
				{
					label: 'Account',
					autogenerate: { directory: 'auth' },
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
