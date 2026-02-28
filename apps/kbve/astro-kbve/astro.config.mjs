import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightSiteGraph from 'starlight-site-graph';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import worker from '@astropub/worker';
import mermaid from 'astro-mermaid';

export default defineConfig({
	site: 'https://kbve.com',
	output: 'static',
	trailingSlash: 'always',
	outDir: '../../../dist/apps/astro-kbve',
	image: {
		domains: ['images.unsplash.com'],
	},
	prefetch: true,
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
				PageSidebar: './src/components/pagesidebar/PageSidebar.astro',
				Footer: './src/components/footer/AstroFooter.astro',
			},
			plugins: [
				starlightSiteGraph({
					graphConfig: {
						actions: [
							'fullscreen',
							'depth',
							'reset-zoom',
							'render-arrows',
							'settings',
						],
						renderLabels: true,
						renderArrows: true,
						depth: 3,
						depthDirection: 'both',
						minZoom: 0.05,
						maxZoom: 4,
						enableZoom: true,
						enablePan: true,
					},
					overridePageSidebar: false,
				}),
			],
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
					label: 'Project',
					collapsed: true,
					autogenerate: { directory: 'project' },
				},
				{
					label: 'Memes',
					autogenerate: { directory: 'memes' },
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
					label: 'Theory',
					collapsed: true,
					autogenerate: { directory: 'theory' },
				},
				{
					label: 'ItemDB',
					collapsed: true,
					autogenerate: { directory: 'itemdb' },
				},
				{
					label: 'QuestDB',
					collapsed: true,
					autogenerate: { directory: 'questdb' },
				},
				{
					label: 'MapDB',
					collapsed: true,
					autogenerate: { directory: 'mapdb' },
				},
				{
					label: 'Blog',
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
	vite: {
		plugins: [tailwindcss()],
		build: {
			rollupOptions: {
				external: ['fsevents', /^\.\.\/pkg/],
			},
		},
		optimizeDeps: {
			exclude: ['fsevents'],
		},
	},
});
