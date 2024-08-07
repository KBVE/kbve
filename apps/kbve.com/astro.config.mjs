import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import svelte from '@astrojs/svelte';
import partytown from '@astrojs/partytown';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';
import starlight from '@astrojs/starlight';

import { fileURLToPath } from 'node:url';
import markdownConfig from './markdown.config';

import { defineConfig as defineViteConfig } from 'vite';

// https://astro.build/config
export default defineConfig({
	site: 'https://kbve.com/',
	image: {
		domains: ['images.unsplash.com'],
	},
	outDir: '../../dist/apps/kbve.com',
	prefetch: true,
	i18n: {
		defaultLocale: 'en',
		locales: ['en', 'fr'],
		fallback: {
			fr: 'en',
		},
		routing: {
			prefixDefaultLocale: false,
		},
	},
	integrations: [
		starlight({
			title: 'KBVE Docs',
			editLink: {
				baseUrl: 'https://github.com/kbve/kbve/edit/dev/apps/kbve.com',
			},
			tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 5 },
			expressiveCode: false, // Disabled Expressive Code
			defaultLocale: 'root',
			locales: {
				root: {
					label: 'English',
					lang: 'en',
				},
				de: { label: 'Deutsch', lang: 'de' },
				es: { label: 'Español', lang: 'es' },
				fa: { label: 'Persian', lang: 'fa', dir: 'rtl' },
				fr: { label: 'Français', lang: 'fr' },
				ja: { label: '日本語', lang: 'ja' },
				'zh-cn': { label: '简体中文', lang: 'zh-CN' },
			},
			// https://starlight.astro.build/guides/sidebar/
			sidebar: [
				{
					label: 'Quick Start Guides',
					translations: {
						de: 'Schnellstartanleitungen',
						es: 'Guías de Inicio Rápido',
						fa: 'راهنمای شروع سریع',
						fr: 'Guides de Démarrage Rapide',
						ja: 'クイックスタートガイド',
						'zh-cn': '快速入门指南',
					},
					autogenerate: { directory: 'guides' },
				},
				{
					label: 'Applications',
					collapsed: true,
					autogenerate: { directory: 'application' },
				},
				{
					label: 'Webmaster',
					autogenerate: { directory: 'webmaster' },
				},
				{
					label: 'Theory',
					autogenerate: { directory: 'theory' },
				},

				{
					label: 'Assets',
					collapsed: true,
					items: [
						{
							label: 'Crypto',
							autogenerate: { directory: 'crypto' },
						},
						{
							label: 'Stocks',
							autogenerate: { directory: 'stock' },
						},
					],
				},

				{
					label: 'Media',
					collapsed: true,
					items: [
						{
							label: 'Music',
							collapsed: false,
							autogenerate: { directory: 'music' },
						},
					],
				},

				{
					label: 'Gaming',
					collapsed: true,
					autogenerate: { directory: 'gaming' },
				},

				
				{
					label: 'Shop',
					collapsed: true,
					items: [
						{
							label: 'Services',
							collapsed: false,
							autogenerate: { directory: 'shop/services' },
						},
						{
							label: 'Hardware',
							collapsed: false,
							autogenerate: { directory: 'shop/hardware' },
						},
						{
							label: 'Merch',
							collapsed: false,
							autogenerate: { directory: 'shop/merch' },
						},
					],
				},

				{
					label: 'Tools & Equipment',
					collapsed: true,
					autogenerate: { directory: 'tools' },
				},

				{
					label: 'Projects',
					autogenerate: { directory: 'project' },
				},
				
				{
					label: 'ItemDB',
					collapsed: true,
					items: [
						{
							label: 'Potions',
							collapsed: false,
							autogenerate: { directory: 'itemdb/potion' },
						},
						{
							label: 'Food',
							collapsed: false,
							autogenerate: { directory: 'itemdb/food' },
						},
						
					],
				},

				{
					label: 'Construction Services',
					collapsed: true,
					autogenerate: { directory: 'construction' },
				},
				{
					label: 'Advanced Topics',
					collapsed: true,
					autogenerate: { directory: 'advanced' },
				},
			],
			social: {
				github: 'https://github.com/kbve/kbve',
				discord: 'https://kbve.com/discord/',
			},
			disable404Route: true,
			customCss: ['./src/styles/starlight.css'],
			favicon: '/favicon.ico',
			components: {
				SiteTitle: './src/components/ui/starlight/SiteTitle.astro',
				Head: './src/components/ui/starlight/Head.astro',
				Footer: './src/components/ui/starlight/Footer.astro',
				TableOfContents:
					'./src/components/ui/starlight/TableOfContents.astro',
			},
			head: [
				{
					tag: 'meta',
					attrs: {
						property: 'og:image',
						content: 'https://kbve.com' + '/social.webp',
					},
				},
				{
					tag: 'meta',
					attrs: {
						property: 'twitter:image',
						content: 'https://kbve.com' + '/social.webp',
					},
				},
			],
		}),

		sitemap({
			i18n: {
				defaultLocale: 'en',
				locales: {
					en: 'en',
					fr: 'fr',
				},
			},
		}),

		react(),
		svelte(),
		partytown(),
		tailwind({
			configFile: fileURLToPath(
				new URL('./tailwind.config.cjs', import.meta.url),
			),
		}),
		mdx({
			...markdownConfig,
			//extendPlugins: "astroDefaults"
		}),
	],
	markdown: markdownConfig,
	// vite: defineViteConfig({
	// 	build: {
	// 		rollupOptions: {
	// 			// Define an additional entry point for your graph.js.js
	// 			input: {
	// 				//main: './src/engine/entry.client.jsx', // Your main JS entry
	// 				graph: './src/engine/Graph.jsx', // Path to your React component
	// 			},
	// 			output: {
	// 				entryFileNames: 'public/[name].js',
	// 			},
	// 		},
	// 	},
	// }),
});
