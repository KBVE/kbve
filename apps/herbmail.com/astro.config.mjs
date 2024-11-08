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
  site: 'https://herbmail.com/',
  outDir: '../../dist/apps/herbmail.com',
  markdown: markdownConfig,
  prefetch: true,
  integrations: [
    starlight({
			title: 'Herbmail Docs',
			editLink: {
				baseUrl: 'https://github.com/kbve/kbve/edit/dev/apps/herbmail.com',
			},
			tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 5 },
			expressiveCode: false,
			defaultLocale: 'root',
			locales: {
				root: {
					label: 'English',
					lang: 'en',
				},
				
			},

			sidebar: [
				{
					label: 'Quick Start Guides',
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

				
			],
			social: {
				github: 'https://github.com/kbve/kbve',
				discord: 'https://kbve.com/discord/',
			},
			disable404Route: true,
			// customCss: ['./src/styles/starlight.css'],
			favicon: '/favicon.ico',
			components: {
				// SiteTitle: './src/components/ui/starlight/SiteTitle.astro',
				// Head: './src/components/ui/starlight/Head.astro',
				// Footer: './src/components/ui/starlight/Footer.astro',
				// TableOfContents:
				// 	'./src/components/ui/starlight/TableOfContents.astro',
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
    sitemap(),
    mdx({
			...markdownConfig,
			//extendPlugins: "astroDefaults"
		}),
    tailwind({
      applyBaseStyles: false,
      configFile: fileURLToPath(
        new URL('./tailwind.config.cjs', import.meta.url)
      ),
    }),
  ],
});
