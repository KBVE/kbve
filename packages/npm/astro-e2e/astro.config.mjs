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
		server: {
			strictPort: true,
			fs: {
				allow: ['../../..'],
			},
		},
		ssr: {
			noExternal: ['path-to-regexp'],
		},
		optimizeDeps: {
			include: ['comlink', 'react', 'react-dom'],
		},
		worker: {
			format: 'es',
			rollupOptions: {
				output: {
					entryFileNames: 'assets/[name].js',
				},
			},
		},
	},
});
