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
						depth: 2,
						renderArrows: true,
					},
					overridePageSidebar: false,
				}),
			],
			sidebar: [
				{
					label: 'Guides',
					autogenerate: { directory: 'guides' },
				},
			],
		}),
		react(),
		sitemap({ i18n: { defaultLocale: 'en' } }),
	],
	vite: {
		plugins: [tailwindcss()],
		build: {
			rollupOptions: {
				external: ['fsevents'],
			},
		},
		optimizeDeps: {
			exclude: ['fsevents'],
		},
	},
});
