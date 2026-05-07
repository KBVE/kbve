import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
// TODO: Re-enable once starlight-site-graph supports Zod 4 / Astro 6
// import starlightSiteGraph from 'starlight-site-graph';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import worker from '@astropub/worker';
import mermaid from 'astro-mermaid';
import rehypeLinkAttrs from './src/lib/rehype-link-attrs.mjs';

export default defineConfig({
	site: 'https://kbve.com',
	output: 'static',
	trailingSlash: 'always',
	outDir: '../../../dist/apps/astro-kbve',
	image: {
		domains: ['images.unsplash.com'],
	},
	prefetch: true,
	markdown: {
		rehypePlugins: [rehypeLinkAttrs],
	},
	integrations: [
		worker(),
		mermaid({
			theme: 'forest',
			autoTheme: true,
			mermaidConfig: {
				flowchart: {
					curve: 'basis',
				},
			},
			iconPacks: [
				{
					name: 'logos',
					loader: () =>
						fetch(
							'https://unpkg.com/@iconify-json/logos@1/icons.json',
						).then((res) => res.json()),
				},
				{
					name: 'iconoir',
					loader: () =>
						fetch(
							'https://unpkg.com/@iconify-json/iconoir@1/icons.json',
						).then((res) => res.json()),
				},
			],
		}),
		starlight({
			title: 'KBVE',
			defaultLocale: 'root',
			locales: {
				root: { label: 'English', lang: 'en' },
			},
			editLink: {
				baseUrl:
					'https://github.com/kbve/kbve/edit/dev/apps/kbve/astro-kbve',
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
				SiteTitle: './src/components/navigation/SiteTitle.astro',
				PageTitle: './src/components/navigation/PageTitle.astro',
				PageSidebar: './src/components/pagesidebar/PageSidebar.astro',
				Footer: './src/components/footer/AstroFooter.astro',
				ThemeProvider: './src/components/theme/ThemeProvider.astro',
				Head: './src/components/navigation/Head.astro',
				Header: './src/components/navigation/Header.astro',
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
						content: 'KBVE',
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
						content: 'https://kbve.com/assets/images/brand/letter_logo.png',
					},
				},
				{
					tag: 'meta',
					attrs: {
						property: 'og:image:alt',
						content: 'KBVE — open-source games, tools, and cloud infrastructure',
					},
				},
				{
					tag: 'meta',
					attrs: {
						name: 'twitter:image',
						content: 'https://kbve.com/assets/images/brand/letter_logo.png',
					},
				},
				{
					tag: 'meta',
					attrs: {
						name: 'twitter:image:alt',
						content: 'KBVE — open-source games, tools, and cloud infrastructure',
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
			// TODO: Re-enable once starlight-site-graph supports Zod 4 / Astro 6
			// plugins: [starlightSiteGraph({ ... })],
			sidebar: [
				{
					label: 'Dashboard',
					collapsed: true,
					items: [
						{ label: 'Overview', link: '/dashboard/', attrs: { 'data-auth-visibility': 'auth' } },
						{ label: 'Kanban', link: '/dashboard/kanban/', attrs: { 'data-auth-visibility': 'auth' } },
						{ label: 'Report', link: '/dashboard/report/', attrs: { 'data-auth-visibility': 'auth' } },
						{ label: 'Graph', link: '/dashboard/graph/', attrs: { 'data-auth-visibility': 'auth' } },
						{ label: 'Security', link: '/dashboard/security/', attrs: { 'data-auth-visibility': 'auth' } },
						{ label: 'ArgoCD', link: '/dashboard/argo/', attrs: { 'data-auth-visibility': 'staff' } },
						{ label: 'ClickHouse', link: '/dashboard/clickhouse/', attrs: { 'data-auth-visibility': 'staff' } },
						{ label: 'Edge', link: '/dashboard/edge/', attrs: { 'data-auth-visibility': 'auth' } },
						{ label: 'Forgejo', link: '/dashboard/forgejo/', attrs: { 'data-auth-visibility': 'staff' } },
						{ label: 'Grafana', link: '/dashboard/grafana/', attrs: { 'data-auth-visibility': 'staff' } },
						{ label: 'Virtual Machines', link: '/dashboard/vm/', attrs: { 'data-auth-visibility': 'staff' } },
						{ label: 'IDE', link: '/dashboard/ide/', attrs: { 'data-auth-visibility': 'staff' } },
					],
				},
				{
					label: 'Guides',
					collapsed: true,
					autogenerate: { directory: 'guides' },
				},
				{
					label: 'Applications',
					collapsed: true,
					autogenerate: { directory: 'application' },
				},
				{
					label: 'Project',
					collapsed: true,
					autogenerate: { directory: 'project' },
				},
				{
					label: 'Memes',
					collapsed: true,
					autogenerate: { directory: 'memes' },
				},
				{
					label: 'Minecraft',
					collapsed: true,
					autogenerate: { directory: 'mc' },
				},
				{
					label: 'Gaming',
					collapsed: true,
					autogenerate: { directory: 'gaming' },
				},
				{
					label: 'Arcade',
					collapsed: true,
					autogenerate: { directory: 'arcade' },
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
					label: 'Game Data',
					collapsed: true,
					items: [
						{
							label: 'GDD',
							autogenerate: { directory: 'gdd' },
						},
						{
							label: 'ItemDB',
							autogenerate: { directory: 'itemdb' },
						},
						{
							label: 'QuestDB',
							autogenerate: { directory: 'questdb' },
						},
						{
							label: 'MapDB',
							autogenerate: { directory: 'mapdb' },
						},
						{
							label: 'NpcDB',
							autogenerate: { directory: 'npcdb' },
						},
					],
				},
				{
					label: 'Theory',
					collapsed: true,
					autogenerate: { directory: 'theory' },
				},
				{
					label: 'Blog',
					collapsed: true,
					autogenerate: { directory: 'blog' },
				},
				{
					label: 'Journal',
					collapsed: true,
					autogenerate: { directory: 'journal' },
				},
				{
					label: 'Recipe',
					collapsed: true,
					autogenerate: { directory: 'recipe' },
				},
				{
					label: 'Legal',
					collapsed: true,
					autogenerate: { directory: 'legal' },
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
		build: {
			rollupOptions: {
				// noVNC CJS has broken top-level await; guacamole-common-js is
				// loaded via vendored ESM at runtime. Both use @vite-ignore
				// dynamic imports — externalize so Rollup never parses them.
				external: ['fsevents', /^\.\.\/pkg/, '@novnc/novnc', /^@novnc\//, 'guacamole-common-js'],
			},
		},
		optimizeDeps: {
			exclude: ['fsevents', '@novnc/novnc', 'guacamole-common-js'],
			esbuildOptions: {
				supported: { 'top-level-await': true },
			},
		},
		ssr: {
			noExternal: [],
			external: ['@novnc/novnc', 'guacamole-common-js'],
		},
	},
});
