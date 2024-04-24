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

// https://astro.build/config
export default defineConfig({
	site: 'https://kbve.com/',
	image: {
		domains: ['images.unsplash.com'],
	},
	outDir: '../../dist/apps/kbve.com',
	markdown: markdownConfig,
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
		sitemap({
			i18n: {
				defaultLocale: 'en',
				locales: {
					en: 'en',
					fr: 'fr',
				},
			},
		}),
		starlight({
			title: 'KBVE Docs',
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
					autogenerate: { directory: 'application' },
				},
				{
					label: 'Tools & Equipment',
					items: [
						{ label: 'Tool Guides', link: 'tools/tool-guides/' },
						{
							label: 'Equipment Care',
							link: 'tools/equipment-care/',
						},
					],
				},
				{
					label: 'Construction Services',
					autogenerate: { directory: 'construction' },
				},
				{
					label: 'Advanced Topics',
					autogenerate: { directory: 'advanced' },
				},
			],
			social: {
				github: 'https://github.com/kbve/kbve',
			},
			disable404Route: true,
			customCss: ['./src/styles/starlight.css'],
			favicon: '/favicon.ico',
			components: {
				SiteTitle: './src/components/ui/starlight/SiteTitle.astro',
				Head: './src/components/ui/starlight/Head.astro',
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
});
