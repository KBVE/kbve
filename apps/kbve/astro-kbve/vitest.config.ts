import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
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
