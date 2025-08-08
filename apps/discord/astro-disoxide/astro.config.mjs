import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from "@tailwindcss/vite";
import mdx from '@astrojs/mdx';
import starlight from '@astrojs/starlight';
import { defineConfig as defineViteConfig } from 'vite';

export default defineConfig({
	site: 'https://discord.sh/',
	output: 'static',
	image: {
		domains: ['images.unsplash.com'],
	},
	outDir: '../../../dist/apps/astro-discord',
	prefetch: true,
	i18n: {
		defaultLocale: 'en',
		locales: ['en'],
		routing: {
			prefixDefaultLocale: false,
		},
	},
	trailingSlash: "never",
	integrations: [
		starlight({
			plugins: [

			],
			title: 'Disoxide Docs',
			editLink: {
				baseUrl: 'https://github.com/kbve/kbve/edit/dev/apps/discord/astro-disoxide',
			},
			tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 5 },
			expressiveCode: false,
			defaultLocale: 'root',
			sidebar: [
				{
					label: 'Guides',
					autogenerate: { directory: 'guides' },
				},
				{
					label: 'Applications',
					collapsed: true,
					autogenerate: { directory: 'application' },
				},
				{
					label: 'Memes',
					autogenerate: { directory: 'memes' },
				},
				{
					label: 'Blog',
					autogenerate: { directory: 'blog' },
				},
			],
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/kbve/kbve' },
				{ icon: 'discord', label: 'Discord', href: 'https://kbve.com/discord' },
			],
			disable404Route: true,
			customCss: ['./src/styles/starlight.css'],
			favicon: '/favicon.ico',
			components: {},
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
				},
			},
		}),
		react({
			experimentalReactChildren: true,
			experimentalDisableStreaming: true,
		}),
		mdx(),
	],

	vite: defineViteConfig({
		ssr: {
			noExternal: ['path-to-regexp'],
		},
		server: {
			watch: {
				ignored: ['!**/node_modules/**'],
			},
		},
		build: {
			rollupOptions: {
				// maxConcurrency: 2,
				output: {},
			},
		},
		resolve: {
			alias: {

			},
		},
		vite: {
			plugins: [
				tailwindcss(),
			]
			,
		},
	}),
});
