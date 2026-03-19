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
			'@kbve/astro': path.resolve(
				__dirname,
				'../../../packages/npm/astro/src/index.ts',
			),
		},
	},
});
