import { defineConfig } from 'astro/config';
import svelte, { vitePreprocess } from '@astrojs/svelte';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from "@tailwindcss/vite";
import mdx from '@astrojs/mdx';
import starlight from '@astrojs/starlight';
import starlightSiteGraph from 'starlight-site-graph';
import worker from "@astropub/worker";
import { defineConfig as defineViteConfig } from 'vite';
import AstroPWA from '@vite-pwa/astro'

export default defineConfig({
    site: 'https://kbve.com/',
    output: 'static',
    image: {
        domains: ['images.unsplash.com'],
    },
    outDir: '../../../dist/apps/astro-kbve',
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
                starlightSiteGraph({
                    graphConfig: {
                        "actions": [
                            "fullscreen",
                            "depth",
                            "reset-zoom",
                            "render-arrows",
                            "settings"
                        ],
                        "renderLabels": true,
                        "renderArrows": true,
                        "depth": 3,
                        "depthDirection": "both",
                        "minZoom": 0.05,
                        "maxZoom": 4,
                        "enableZoom": true,
                        "enablePan": true,

                    },
                }),
            ],
            title: 'KBVE Docs',
            editLink: {
                baseUrl: 'https://github.com/kbve/kbve/edit/dev/apps/kbve/astro-kbve',
            },
            tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 5 },
            expressiveCode: true,
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
            social: [
                { icon: 'github', label: 'GitHub', href: 'https://github.com/kbve/kbve' },
                { icon: 'discord', label: 'Discord', href: 'https://kbve.com/discord' },
            ],
            disable404Route: true,
            customCss: ['./src/styles/starlight.css'],
            favicon: '/favicon.ico',
            components: {
                SiteTitle: './src/layouts/starlight/SiteTitle.astro',
                Head: './src/layouts/starlight/Head.astro',
                Footer: './src/layouts/starlight/Footer.astro',
                TableOfContents:
                    './src/layouts/starlight/TableOfContents.astro',
                PageSidebar: './src/layouts/starlight/PageSidebar.astro',
                PageFrame: './src/layouts/starlight/DroidPageFrame.astro',
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
                    en: 'en'
                   
                },
            },
        }),

       
        //partytown(),
        worker(),
        react({
            experimentalReactChildren: true,
            experimentalDisableStreaming: true,
        }),
        svelte(),
        mdx(),
        AstroPWA({
            base: '/',
            scope: '/',
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg'],
            manifest: {
                name: 'KBVE.com',
                short_name: 'KBVE',
                theme_color: '#ffffff',
                icons: [
                    {
                        src: 'pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png',
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any maskable',
                    },
                ],
            },
            workbox: {
                maximumFileSizeToCacheInBytes: 9000000,
                cleanupOutdatedCaches: true,
                inlineWorkboxRuntime: true,
                globPatterns: ['**/*.{html,css,js,svg,png,ico,txt,lottie}'],
                navigateFallback: null,
                navigationPreload: true,
                navigateFallbackDenylist: [
                    /^\/sw\.js$/,
                    /^\/workbox-[a-z0-9\-]+\.js$/,
                    /^\/ws$/,
                    /^\/api\/.*/,
                     /^\/auth(?:\/.*)?$/,
                     /^\/register(?:\/.*)?$/,
                     /^\/login(?:\/.*)?$/,
                ],

                runtimeCaching: [
                    {
                            urlPattern: /^\/auth(?:\/.*)?$/,
                            handler: 'NetworkOnly',
                    },
                    {
                        urlPattern: ({ request }) => request.mode === 'navigate',
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'pages',
                            networkTimeoutSeconds: 3,
                            expiration: {
                                maxEntries: 20,
                                maxAgeSeconds: 60 * 60 * 24,
                            },
                        },
                    },
                    {
                        urlPattern: /\/api\/.*/,
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'api-json',
                            networkTimeoutSeconds: 1,
                            expiration: {
                                maxEntries: 5,
                                maxAgeSeconds: 60 * 5,
                            },
                        },
                    },
                    {
                        urlPattern: ({ request }) =>
                            ['script', 'style', 'font', 'image'].includes(request.destination),
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'static-assets',
                            expiration: {
                                maxEntries: 100,
                                maxAgeSeconds: 60 * 60 * 24 * 30,
                            },
                        },
                    },

                ],
            },
            experimental: {
                directoryAndTrailingSlashHandler: true,
            },
            devOptions: {
                enabled: false
                /* other options */
            }

        }),

        
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
         optimizeDeps: {
            include: ['comlink'],
            exclude: ['@kbve/droid']
        },
        worker: {
            format: 'es',
            rollupOptions: {
                output: {
                    entryFileNames: 'assets/[name].js',
                },
            },
        },
        build: {
            // commonjsOptions: {
            //     include: [/node_modules/, /@kbve\/droid/],
            // },
            rollupOptions: {
                // maxConcurrency: 2,
                output: {
                    
                },
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
