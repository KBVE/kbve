import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import istanbul from 'vite-plugin-istanbul';

const coverage = process.env.COVERAGE === '1';
const coveragePlugins = coverage
	? [
			istanbul({
				include: 'src/**/*.{ts,tsx}',
				exclude: [
					'node_modules',
					'**/*.spec.ts',
					'**/*.test.ts',
					'**/*.d.ts',
				],
				extension: ['.ts', '.tsx'],
				forceBuildInstrument: false,
			}),
		]
	: [];

export default defineConfig({
	site: 'https://cryptothrone.com',
	output: 'static',
	trailingSlash: 'always',
	outDir: '../../../dist/apps/astro-cryptothrone',
	integrations: [
		starlight({
			title: 'CryptoThrone',
			customCss: ['./src/styles/global.css'],
			components: {
				Header: './src/components/starlight/Header.astro',
				Footer: './src/components/starlight/Footer.astro',
				PageTitle: './src/components/starlight/PageTitle.astro',
			},
			sidebar: [
				{
					label: 'Game',
					items: [
						{ label: 'Play', slug: 'game/play' },
					],
				},
				{
					label: 'Guides',
					items: [{ autogenerate: { directory: 'guides' } }],
				},
				{
					label: 'Account',
					items: [{ autogenerate: { directory: 'auth' } }],
				},
			],
		}),
		react(),
		sitemap(),
	],
	vite: {
		plugins: [tailwindcss(), ...coveragePlugins],
		esbuild: { keepNames: true },
		resolve: {
			dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
		},
		build: {
			chunkSizeWarningLimit: 1200,
			rollupOptions: {
				external: ['fsevents'],
				output: {
					manualChunks(id) {
						if (id.includes('node_modules/phaser')) return 'phaser';
						if (id.includes('node_modules/grid-engine'))
							return 'grid-engine';
					},
				},
			},
		},
		optimizeDeps: {
			exclude: ['fsevents'],
		},
	},
});
