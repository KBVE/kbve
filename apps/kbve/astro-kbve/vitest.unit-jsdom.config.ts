import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: ['./vitest.unit-jsdom.setup.ts'],
		include: ['src/**/*.unit.test.{ts,tsx}'],
		css: false,
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src'),
			'@kbve/astro': path.resolve(
				__dirname,
				'../../../packages/npm/astro/src/index.ts',
			),
			'@kbve/devops': path.resolve(
				__dirname,
				'../../../packages/npm/devops/src/index.ts',
			),
			'@kbve/droid': path.resolve(
				__dirname,
				'../../../packages/npm/droid/src/index.ts',
			),
			'@kbve/laser': path.resolve(
				__dirname,
				'../../../packages/npm/laser/src/index.ts',
			),
		},
	},
});
