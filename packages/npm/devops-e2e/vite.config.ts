/// <reference types='vitest' />
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
	root: __dirname,
	cacheDir: '../../../node_modules/.vite/npm/devops-e2e',

	plugins: [tsconfigPaths()],

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
