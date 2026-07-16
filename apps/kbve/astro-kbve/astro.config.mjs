import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
// TODO: Re-enable once starlight-site-graph supports Zod 4 / Astro 6
// import starlightSiteGraph from 'starlight-site-graph';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import worker from '@astropub/worker';
import mermaid from 'astro-mermaid';
import { unified } from '@astrojs/markdown-remark';
import rehypeLinkAttrs from './src/lib/rehype-link-attrs.mjs';
import { readFileSync } from 'node:fs';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const DROID_SRC = fileURLToPath(
	new URL('../../../packages/npm/droid/src/index.ts', import.meta.url),
);
const ASTRO_PKG_SRC = fileURLToPath(
	new URL('../../../packages/npm/astro/src/index.ts', import.meta.url),
);

const DASH_PROXY_PREFIX = '/__dashproxy';

function dashProxyDevIntegration() {
	const attach = (server) => {
		console.log('[dash-proxy] dev proxy registered →', DASH_PROXY_PREFIX);
		server.middlewares.use((req, res, next) => {
			if (!req.url?.startsWith(DASH_PROXY_PREFIX + '/')) {
				return next();
			}
			const path = req.url.slice(DASH_PROXY_PREFIX.length);
			const upstream = https.request(
				{
					hostname: 'kbve.com',
					port: 443,
					path,
					method: req.method,
					headers: { ...req.headers, host: 'kbve.com' },
				},
				(upRes) => {
					res.writeHead(upRes.statusCode || 502, upRes.headers);
					upRes.pipe(res);
				},
			);
			upstream.on('error', (err) => {
				console.error('[dash-proxy] error', err.message);
				res.statusCode = 502;
				res.end('dash proxy error');
			});
			req.pipe(upstream);
		});
	};
	return {
		name: 'kbve-dash-proxy-dev',
		hooks: {
			'astro:server:setup': ({ server }) => attach(server),
		},
	};
}
import { fileURLToPath } from 'node:url';

// Inlined into <head> so it runs before the (edge-injected, async) ad script.
// Neutralizes malvertising forced redirects without removing AdSense.
const redirectGuard = readFileSync(
	fileURLToPath(new URL('./src/lib/redirect-guard.js', import.meta.url)),
	'utf-8',
);

export default defineConfig({
	site: 'https://kbve.com',
	output: 'static',
	trailingSlash: 'always',
	outDir: '../../../dist/apps/astro-kbve',
	redirects: {
		'/application/rn-web/': '/application/rn/',
		'/dashboard/profile/': '/dashboard/account/',
		'/settings/': '/dashboard/account/',
	},
	image: {
		domains: ['images.unsplash.com'],
	},
	// Prefetch warms destination HTML on hover so ClientRouter's swap
	// has zero wait-for-network latency on the common case. `hover`
	// strategy avoids the bandwidth cost of `viewport`/`load` while
	// still feeling instant. `prefetchAll: true` opts every internal
	// link in by default — individual links can opt out with
	// `data-astro-prefetch="false"`.
	prefetch: {
		prefetchAll: true,
		defaultStrategy: 'hover',
	},
	markdown: {
		processor: unified({ rehypePlugins: [rehypeLinkAttrs] }),
	},
	integrations: [
		dashProxyDevIntegration(),
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
					url: 'https://unpkg.com/@iconify-json/logos@1/icons.json',
				},
				{
					name: 'iconoir',
					url: 'https://unpkg.com/@iconify-json/iconoir@1/icons.json',
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
				Sidebar: './src/components/navigation/Sidebar.astro',
				MarkdownContent:
					'./src/components/dashboard/MarkdownContent.astro',
			},
			head: [
				{
					// Ad redirect guard — must execute before any ad script.
					tag: 'script',
					content: redirectGuard,
				},
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
						{ label: 'Portal', link: '/dashboard/portal/', attrs: { 'data-auth-visibility': 'staff' } },
						{
							label: 'Account',
							collapsed: true,
							items: [
								{ label: 'Profile', link: '/dashboard/profile/', attrs: { 'data-auth-visibility': 'auth' } },
								{ label: 'Account', link: '/dashboard/account/', attrs: { 'data-auth-visibility': 'auth' } },
								{ label: 'Marketplace', link: '/dashboard/market/', attrs: { 'data-auth-visibility': 'auth' } },
							],
						},
						{
							label: 'Workspace',
							collapsed: true,
							items: [
								{ label: 'Kanban', link: '/dashboard/kanban/', attrs: { 'data-auth-visibility': 'auth' } },
								{ label: 'Report', link: '/dashboard/report/', attrs: { 'data-auth-visibility': 'auth' } },
								{ label: 'Graph', link: '/dashboard/graph/', attrs: { 'data-auth-visibility': 'auth' } },
								{ label: 'Security', link: '/dashboard/security/', attrs: { 'data-auth-visibility': 'auth' } },
							],
						},
						{
							label: 'Agents',
							collapsed: true,
							items: [
								{ label: 'Overview', link: '/dashboard/agents/', attrs: { 'data-auth-visibility': 'auth' } },
								{ label: 'GitHub', link: '/dashboard/agents/github/', attrs: { 'data-auth-visibility': 'auth' } },
								{ label: 'DiscordSH', link: '/dashboard/agents/discordsh/', attrs: { 'data-auth-visibility': 'auth' } },
							],
						},
						{ label: 'API', link: '/dashboard/api/' },
						{ label: 'ArgoCD', link: '/dashboard/argo/', attrs: { 'data-auth-visibility': 'staff' } },
						{ label: 'ClickHouse', link: '/dashboard/clickhouse/', attrs: { 'data-auth-visibility': 'staff' } },
						{ label: 'Edge', link: '/dashboard/edge/', attrs: { 'data-auth-visibility': 'auth' } },
						{ label: 'Forgejo', link: '/dashboard/forgejo/', attrs: { 'data-auth-visibility': 'staff' } },
						{ label: 'Grafana', link: '/dashboard/grafana/', attrs: { 'data-auth-visibility': 'staff' } },
						{ label: 'Virtual Machines', link: '/dashboard/vm/', attrs: { 'data-auth-visibility': 'staff' } },
						{ label: 'IDE', link: '/dashboard/ide/', attrs: { 'data-auth-visibility': 'staff' } },
						{
							label: 'GameOps',
							collapsed: true,
							items: [
								{ label: 'Overview', link: '/dashboard/gameops/', attrs: { 'data-auth-visibility': 'staff' } },
								{ label: 'ROWS', link: '/dashboard/gameops/rows/', attrs: { 'data-auth-visibility': 'staff' } },
								{ label: 'Factorio', link: '/dashboard/gameops/factorio/', attrs: { 'data-auth-visibility': 'staff' } },
								{ label: 'Minecraft', link: '/dashboard/gameops/mc/', attrs: { 'data-auth-visibility': 'staff' } },
							],
						},
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
						{
							label: 'TileDB',
							items: [{ autogenerate: { directory: 'tiledb' } }],
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
	vite: {
		plugins: [tailwindcss()],
		esbuild: { keepNames: true },
		define: {
			'process.env.JEST_WORKER_ID': 'undefined',
			__DEV__: 'false',
			global: 'globalThis',
		},
		resolve: {
			alias: [
				{ find: /^react-native$/, replacement: 'react-native-web' },
				{ find: /^@kbve\/droid$/, replacement: DROID_SRC },
				{ find: /^@kbve\/astro$/, replacement: ASTRO_PKG_SRC },
			],
			dedupe: [
				'@kbve/droid',
				'@kbve/astro',
				'nanostores',
				'@nanostores/persistent',
			],
			extensions: [
				'.web.tsx',
				'.web.ts',
				'.web.jsx',
				'.web.js',
				'.tsx',
				'.ts',
				'.jsx',
				'.js',
				'.json',
			],
		},
		build: {
			rollupOptions: {
				// noVNC CJS has broken top-level await; guacamole-common-js is
				// loaded via vendored ESM at runtime. Both use @vite-ignore
				// dynamic imports — externalize so Rollup never parses them.
				external: ['fsevents', /^\.\.\/pkg/, '@novnc/novnc', /^@novnc\//, 'guacamole-common-js'],
			},
		},
		optimizeDeps: {
			include: [
				'react-native-web',
				'react-native-reanimated',
				'react-native-worklets',
				'react-native-svg',
				'react-native-gesture-handler',
					'@scalar/api-reference',
			],
			exclude: [
				'fsevents',
				'@novnc/novnc',
				'guacamole-common-js',
				'expo-modules-core',
				'@kbve/droid',
				'@kbve/astro',
			],
			rolldownOptions: {
				transform: {
					define: {
						'process.env.JEST_WORKER_ID': 'undefined',
						__DEV__: 'false',
						global: 'globalThis',
					},
				},
				moduleTypes: { '.js': 'jsx' },
				resolve: {
					extensions: [
						'.web.tsx',
						'.web.ts',
						'.web.jsx',
						'.web.js',
						'.tsx',
						'.ts',
						'.jsx',
						'.js',
						'.json',
					],
				},
			},
		},
		ssr: {
			noExternal: [],
			external: ['@novnc/novnc', 'guacamole-common-js'],
		},
	},
});
