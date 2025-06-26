import { defineConfig } from 'astro/config';
import svelte, { vitePreprocess } from '@astrojs/svelte';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from "@tailwindcss/vite";
import mdx from '@astrojs/mdx';
import rehypeMermaid from 'rehype-mermaid';
import starlight from '@astrojs/starlight';
import alpine from '@astrojs/alpinejs';
import { fileURLToPath } from 'node:url';
import markdownConfig from './markdown.config';

// Removed starlight-site-graph import as it's causing build issues and not needed for meme app

import worker from "@astropub/worker";
import { defineConfig as defineViteConfig } from 'vite';
// import topLevelAwait from 'vite-plugin-top-level-await';
import { resolve } from 'path';

import compressor from "astro-compressor";
import { shield } from '@kindspells/astro-shield'
import AstroPWA from '@vite-pwa/astro'

export default defineConfig({
    site: 'https://meme.sh/',
    output: 'static',
    image: {
        domains: ['images.unsplash.com'],
    },
    outDir: '../../../dist/apps/astro-memes',
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
                // Removed starlight-site-graph plugin as it's causing build issues
            ],
            title: 'Memes Docs',
            editLink: {
                baseUrl: 'https://github.com/kbve/kbve/edit/dev/apps/memes/astro-memes',
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
                    label: 'Blog',
                    autogenerate: { directory: 'blog' },
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
                    // fr: 'fr',
                },
            },
        }),

        //alpine({ entrypoint: '/src/layout/scripts/entrypoints' }),
        //partytown(),
        worker(),
        react({
            experimentalReactChildren: true,
            experimentalDisableStreaming: true,
        }),
        svelte(),

        AstroPWA({
            base: '/',
            scope: '/',
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg'],
            manifest: {
                name: 'Meme.sh',
                short_name: 'MEME',
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
                    {
                        urlPattern: /^\/_astro\/.*\.js$/,
                        handler: 'StaleWhileRevalidate', // or 'StaleWhileRevalidate' for better perf
                        options: {
                                cacheName: 'astro-islands',
                                expiration: {
                                maxEntries: 50,
                                maxAgeSeconds: 60 * 60 * 24,
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

        // (await import("@playform/compress")).default({
        //     CSS: true,
        //     HTML: {
        //         "html-minifier-terser": {
        //             removeAttributeQuotes: false,
        //         },
        //     },
        //     Image: false,
        //     JavaScript: true,
        //     SVG: true,
        // }),

        // shield({
        //     sri: { hashesModule: resolve(new URL('.', import.meta.url).pathname, 'src', 'generated', 'sriHashes.mjs') },
        // }),

        // compressor({
        //     gzip: true,
        //     brotli: false,
        //     fileExtensions: [
        //         ".html",
        //         ".js",
        //         ".css",
        //         ".mjs",
        //         ".cjs",
        //         ".svg",
        //         ".xml",
        //         ".txt",
        //         ".json"
        //     ]
        // }),

        // mdx({
        // 	...markdownConfig,
        // 	//extendPlugins: "astroDefaults"
        // }),
    ],

    // markdown: markdownConfig,

    markdown: {
        rehypePlugins: [[rehypeMermaid, { strategy: 'img-svg', dark: true }]],
    },

    vite: defineViteConfig({
        ssr: {
            noExternal: ['path-to-regexp', '@react-three/fiber', 'three', 'its-fine', '@react-three/drei'],
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

            },
        },
        vite: {
            plugins: [
                tailwindcss(),

                // {
                // 	name: 'emit-sw',
                // 	apply: 'build',
                // 	enforce: 'post',
                // 	async generateBundle(_, bundle) {
                // 		this.emitFile({
                // 			type: 'chunk',
                // 			id: resolve('./src/layout/scripts/sw.ts'),
                // 			fileName: 'sw.js',
                // 		});
                // 	}
                // },
            ]
            ,
        },
        // Apply the top-level await plugin to our vite.config.js
        // plugins: [
        // 	topLevelAwait({
        // 		promiseExportName: '__tla',
        // 		promiseImportName: (i) => `__tla_${i}`,
        // 	}),
        // ],
    }),
});
