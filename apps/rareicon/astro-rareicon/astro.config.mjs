import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import worker from '@astropub/worker';

export default defineConfig({
	site: 'https://rareicon.com',
	output: 'static',
	trailingSlash: 'always',
	outDir: '../../../dist/apps/astro-rareicon',
	image: {
		domains: ['images.unsplash.com'],
	},
	prefetch: true,
	integrations: [
		worker(),
		starlight({
			title: 'RareIcon',
			defaultLocale: 'root',
			locales: {
				root: { label: 'English', lang: 'en' },
			},
			editLink: {
				baseUrl:
					'https://github.com/kbve/kbve/edit/dev/apps/rareicon/astro-rareicon',
			},
			expressiveCode: true,
			customCss: ['./src/styles/global.css'],
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/kbve/kbve',
				},
				{
					icon: 'discord',
					label: 'Discord',
					href: 'https://kbve.com/discord/',
				},
			],
			components: {
				PageTitle: './src/components/starlight/PageTitle.astro',
				Footer: './src/components/starlight/Footer.astro',
				Sidebar: './src/components/starlight/Sidebar.astro',
				Header: './src/components/starlight/Header.astro',
			},
			head: [
				{
					tag: 'meta',
					attrs: {
						property: 'og:type',
						content: 'website',
					},
				},
				{
					tag: 'meta',
					attrs: {
						property: 'og:site_name',
						content: 'RareIcon',
					},
				},
				{
					tag: 'meta',
					attrs: {
						name: 'twitter:card',
						content: 'summary_large_image',
					},
				},
				{
					tag: 'meta',
					attrs: {
						property: 'og:image',
						content: 'https://rareicon.com/assets/steam/rareicon_library_header_920_x_430px.png',
					},
				},
				{
					tag: 'meta',
					attrs: {
						property: 'og:image:width',
						content: '920',
					},
				},
				{
					tag: 'meta',
					attrs: {
						property: 'og:image:height',
						content: '430',
					},
				},
				{
					tag: 'meta',
					attrs: {
						property: 'og:image:alt',
						content: 'RareIcon — 2D sci-fi action-RPG bullet-hell roguelite',
					},
				},
				{
					tag: 'meta',
					attrs: {
						name: 'twitter:image',
						content: 'https://rareicon.com/assets/steam/rareicon_library_header_920_x_430px.png',
					},
				},
				{
					tag: 'meta',
					attrs: {
						name: 'twitter:image:alt',
						content: 'RareIcon — 2D sci-fi action-RPG bullet-hell roguelite',
					},
				},
				{
					tag: 'meta',
					attrs: {
						name: 'twitter:site',
						content: '@kbve',
					},
				},
				{
					tag: 'meta',
					attrs: {
						name: 'twitter:creator',
						content: '@kbve',
					},
				},
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
						href: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Lora:ital,wght@0,400;0,500;0,600;1,400&display=swap',
					},
				},
			],
			sidebar: [
				{
					label: 'Steam',
					link: '/steam/',
				},
				{
					label: 'Press Kit',
					link: '/press/',
				},
				{
					label: 'Getting Started',
					autogenerate: { directory: 'guides' },
				},
				{
					label: 'Game',
					autogenerate: { directory: 'game' },
				},
				{
					label: 'Icons',
					collapsed: true,
					autogenerate: { directory: 'icons' },
				},
				{
					label: 'Account',
					autogenerate: { directory: 'auth' },
				},
				{
					label: 'Journal',
					link: 'https://kbve.com/journal/',
					attrs: {
						target: '_blank',
						rel: 'noopener',
					},
				},
			],
		}),
		react(),
		sitemap({
			i18n: {
				defaultLocale: 'en',
				locales: {
					en: 'en',
				},
			},
		}),
	],
	experimental: {
		queuedRendering: {
			enabled: true,
			poolSize: 3000,
			contentCache: true,
		},
	},
	vite: {
		plugins: [tailwindcss()],
		resolve: {
			dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
		},
	},
});
