/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
	root: __dirname,
	cacheDir: '../../node_modules/.vite/apps/js-embed-passport',

	server: {
		port: 4200,
		host: 'localhost',
	},

	preview: {
		port: 4300,
		host: 'localhost',
	},

	plugins: [react({
		babel: {
		  plugins: ['babel-plugin-macros', 'babel-plugin-styled-components'],
		},
	  }), nxViteTsPaths()],

	// Uncomment this if you are using workers.
	// worker: {
	//  plugins: [ nxViteTsPaths() ],
	// },

	optimizeDeps: {
		esbuildOptions: {
		  target: 'es2020',
		},
	},

	build: {
		outDir: '../../dist/apps/js-embed-passport',
		reportCompressedSize: true,
		commonjsOptions: {
			transformMixedEsModules: true,
		},
		rollupOptions: {
			external: ['fs', 'path', 'process'],
			output: {
				// ES Module Output
				format: 'es', // ES module format
				// Change the output directory structure and naming
				entryFileNames: `js-embed-passport.js`,
				chunkFileNames: `[name].js`,
				assetFileNames: `[name].[ext]`,
			},
		},
	},

	test: {
		globals: true,
		cache: {
			dir: '../../node_modules/.vitest',
		},
		environment: 'jsdom',
		include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],

		reporters: ['default'],
		coverage: {
			reportsDirectory: '../../coverage/apps/js-embed-passport',
			provider: 'v8',
		},
	},
});
