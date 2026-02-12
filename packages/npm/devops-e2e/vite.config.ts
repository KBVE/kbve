/// <reference types='vitest' />
import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
	root: __dirname,
	cacheDir: '../../../node_modules/.vite/npm/devops-e2e',

	plugins: [nxViteTsPaths()],

	test: {
		globals: true,
		watch: false,
		environment: 'node',
		include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],
		reporters: ['default'],
		coverage: {
			reportsDirectory: '../../../coverage/packages/npm/devops-e2e',
			provider: 'v8',
		},
	},
});
