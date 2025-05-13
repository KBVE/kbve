import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import svelte, {vitePreprocess} from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';
import tailwindcss from "@tailwindcss/vite";
import rehypeMermaid from 'rehype-mermaid';
import starlight from '@astrojs/starlight';
import mdx from '@astrojs/mdx';

//import starlightSiteGraph from 'starlight-site-graph';

import { defineConfig as defineViteConfig } from 'vite';

import { resolve } from 'path';
import compressor from "astro-compressor";
import { shield } from '@kindspells/astro-shield'


export default defineConfig({
	site: 'https://kbve.com/',
	output: 'static',
	image: {
		domains: ['images.unsplash.com'],
	},
	outDir: './dist/astro-kbve',
	prefetch: true,
	i18n: {
		defaultLocale: 'en',
		locales: ['en'],
		routing: {
			prefixDefaultLocale: false,
		},
	},

	integrations: [
		starlight({
			plugins: [
				// starlightSiteGraph({
				// graphConfig: {
			 	// 	renderArrows: true,
			 	// },
				// }),
			],
			title: 'KBVE Docs',
			editLink: {
				baseUrl: 'https://github.com/kbve/kbve/edit/dev/apps/kbve/kbve.com',
			},
			tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 5 },
			expressiveCode: true, 
			defaultLocale: 'root',

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

				{
					label: 'Legal',
					collapsed: true,
					autogenerate: { directory: 'legal' },
				},
			],
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/withastro/starlight' },
				{ icon: 'discord', label: 'Discord', href: 'https://astro.build/chat' },
			],
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
				},
			},
		}),
		mdx(),
		react(),
		svelte(),
		//partytown(),

		// (await import("@playform/compress")).default({
		// 	CSS: true,
		// 	HTML: {
		// 		"html-minifier-terser": {
		// 			removeAttributeQuotes: false,
		// 		},
		// 	},
		// 	Image: false,
		// 	JavaScript: true,
		// 	SVG: true,
		// }),

		// shield({
		// 	sri: { hashesModule: resolve(new URL('.', import.meta.url).pathname, 'src', 'generated', 'sriHashes.mjs') },
		// }),

		// compressor({
		// 	gzip: true,
		// 	brotli: false,
		// 	fileExtensions: [
		// 		".html",
		// 		".js",
		// 		".css",
		// 		".mjs",
		// 		".cjs",
		// 		".svg",
		// 		".xml",
		// 		".txt",
		// 		".json"
		// 	]
		// }),

	],

	markdown: {
		rehypePlugins: [[rehypeMermaid, { strategy: 'img-svg', dark: true }]],
	},

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
				output: {
					manualChunks: (id) => {
						if (id.includes('node_modules')) {
							return id
								.toString()
								.split('node_modules/')[1]
								.split('/')[0];
						}
					},
				},
			},
		},
		resolve: {
			alias: {
				'three/examples/jsm/controls/DragControls.js':
					'three/examples/jsm/controls/DragControls.js',
				'three/examples/jsm/controls/OrbitControls.js':
					'three/examples/jsm/controls/OrbitControls.js',
				'three/examples/jsm/controls/TrackballControls.js':
					'three/examples/jsm/controls/TrackballControls.js',
				'three/examples/jsm/controls/FlyControls.js':
					'three/examples/jsm/controls/FlyControls.js',
				'three/examples/jsm/postprocessing/EffectComposer.js':
					'three/examples/jsm/postprocessing/EffectComposer.js',
				'three/examples/jsm/postprocessing/RenderPass.js':
					'three/examples/jsm/postprocessing/RenderPass.js',
			},
		},

		vite: {
			plugins: [tailwindcss()],
		  },

	}),
});
