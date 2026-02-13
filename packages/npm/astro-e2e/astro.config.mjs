import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
	output: 'static',
	outDir: '../../../dist/packages/npm/astro-e2e',
	integrations: [
		react({
			experimentalReactChildren: true,
			experimentalDisableStreaming: true,
		}),
	],
	vite: {
		ssr: {
			noExternal: ['path-to-regexp'],
		},
		optimizeDeps: {
			include: ['react', 'react-dom'],
			exclude: ['@kbve/droid'],
		},
	},
});
