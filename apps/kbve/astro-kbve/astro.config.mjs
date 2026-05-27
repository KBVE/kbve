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
	redirects: {
		'/account': '/dashboard/account/',
		'/account/': '/dashboard/account/',
		'/profile': '/dashboard/profile/',
		'/profile/': '/dashboard/profile/',
		'/profile/account': '/dashboard/account/',
		'/profile/account/': '/dashboard/account/',
		'/profile/market': '/dashboard/market/',
		'/profile/market/': '/dashboard/market/',
	},
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
						{ label: 'Profile', link: '/dashboard/profile/', attrs: { 'data-auth-visibility': 'auth' } },
						{ label: 'Account', link: '/dashboard/account/', attrs: { 'data-auth-visibility': 'auth' } },
						{
							label: 'Agents',
							collapsed: true,
							items: [
								{ label: 'Overview', link: '/dashboard/agents/', attrs: { 'data-auth-visibility': 'auth' } },
								{ label: 'GitHub', link: '/dashboard/agents/github/', attrs: { 'data-auth-visibility': 'auth' } },
								{ label: 'DiscordSH', link: '/dashboard/agents/discordsh/', attrs: { 'data-auth-visibility': 'auth' } },
							],
						},
						{ label: 'Marketplace', link: '/dashboard/market/', attrs: { 'data-auth-visibility': 'auth' } },
						{ label: 'API', link: '/dashboard/api/' },
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
						{ label: 'ROWS (Game Ops)', link: '/dashboard/rows/', attrs: { 'data-auth-visibility': 'staff' } },
					],
				},
				{
					label: 'Project',
					collapsed: true,
					items: [{ autogenerate: { directory: 'project' } }],
				},
				{
					label: 'Marketplace',
					collapsed: true,
					items: [{ autogenerate: { directory: 'market' } }],
				},
				{
					label: 'Gaming',
					collapsed: true,
					items: [
						{ label: 'Overview', link: '/gaming/' },
						{
							label: 'Minecraft',
							collapsed: true,
							items: [{ autogenerate: { directory: 'mc' } }],
						},
						
						{ label: 'BitCraft', link: '/gaming/bitcraft/' },
						{ label: 'League of Legends', link: '/gaming/lol/' },
						{ label: 'RimWorld', link: '/gaming/rimworld/' },
						{ label: 'Titanfall', link: '/gaming/titanfall/' },
						{ label: 'World of Warcraft', link: '/gaming/wow/' },
						{ label: 'OSRS', link: '/osrs/' },
						
					],
				},
				{
					label: 'Arcade',
					collapsed: true,
					items: [{ autogenerate: { directory: 'arcade' } }],
				},
				{
					label: 'Applications',
					collapsed: true,
					items: [{ autogenerate: { directory: 'application' } }],
				},
				{
					label: 'Assets',
					collapsed: true,
					items: [
						{
							label: 'Crypto',
							items: [{ autogenerate: { directory: 'crypto' } }],
						},
						{
							label: 'Stocks',
							items: [{ autogenerate: { directory: 'stock' } }],
						},
					],
				},
				{
					label: 'Game Data',
					collapsed: true,
					items: [
						{
							label: 'GDD',
							items: [{ autogenerate: { directory: 'gdd' } }],
						},
						{
							label: 'ItemDB',
							items: [{ autogenerate: { directory: 'itemdb' } }],
						},
						{
							label: 'QuestDB',
							items: [{ autogenerate: { directory: 'questdb' } }],
						},
						{
							label: 'MapDB',
							items: [{ autogenerate: { directory: 'mapdb' } }],
						},
						{
							label: 'NpcDB',
							items: [{ autogenerate: { directory: 'npcdb' } }],
						},
					],
				},
				{
					label: 'Theory',
					collapsed: true,
					items: [{ autogenerate: { directory: 'theory' } }],
				},
				{
					label: 'Blog',
					collapsed: true,
					items: [{ autogenerate: { directory: 'blog' } }, 
						{
					label: 'Journal',
					collapsed: true,
					items: [{ autogenerate: { directory: 'journal' } }],
				}
					],
				},
				{
					label: 'Recipe',
					collapsed: true,
					items: [{ autogenerate: { directory: 'recipe' } }],
				},
				{
					label: 'Guides',
					collapsed: true,
					items: [{ autogenerate: { directory: 'guides' } }],
				},
				{
					label: 'Legal',
					collapsed: true,
					items: [{ autogenerate: { directory: 'legal' } }],
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
