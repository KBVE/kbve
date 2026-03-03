import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
	site: 'https://cryptothrone.com',
	output: 'static',
	trailingSlash: 'always',
	outDir: '../../../dist/apps/astro-cryptothrone',
	integrations: [
		starlight({
			title: 'CryptoThrone',
			customCss: ['./src/styles/global.css'],
			sidebar: [
				{
					label: 'Game',
					items: [
						{ label: 'Play', slug: 'game/play' },
					],
				},
				{
					label: 'Guides',
					autogenerate: { directory: 'guides' },
				},
			],
		}),
		react(),
		sitemap(),
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
