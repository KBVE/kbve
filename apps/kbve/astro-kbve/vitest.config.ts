import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: [
			'src/**/*.test.ts',
			'src/**/*.spec.ts',
			'src/**/*.test.tsx',
			'src/**/*.spec.tsx',
		],
		// graphExplorer suites predate tsx inclusion and no longer match the
		// components; re-enable once rewritten.
		exclude: ['**/node_modules/**', '**/graphExplorer/*.test.tsx'],
		testTimeout: 20000,
		hookTimeout: 20000,
	},
	resolve: {
		alias: [
			{ find: '@', replacement: path.resolve(__dirname, 'src') },
			{
				find: '@kbve/astro',
				replacement: path.resolve(
					__dirname,
					'../../../packages/npm/astro/src/index.ts',
				),
			},
			{
				find: '@kbve/devops',
				replacement: path.resolve(
					__dirname,
					'../../../packages/npm/devops/src/index.ts',
				),
			},
			{
				find: '@kbve/droid',
				replacement: path.resolve(
					__dirname,
					'../../../packages/npm/droid/src/index.ts',
				),
			},
			{
				find: /^@kbve\/laser\/(ecs|mecs|phaser|r3f)$/,
				replacement: path.resolve(
					__dirname,
					'../../../packages/npm/laser/src/$1.ts',
				),
			},
			{
				find: '@kbve/laser',
				replacement: path.resolve(
					__dirname,
					'../../../packages/npm/laser/src/index.ts',
				),
			},
			{
				find: /^@kbve\/proto\/(.*)$/,
				replacement: path.resolve(
					__dirname,
					'../../../packages/data/codegen/generated/$1',
				),
			},
			{
				find: '@kbve/proto',
				replacement: path.resolve(
					__dirname,
					'../../../packages/data/codegen/generated/index.ts',
				),
			},
		],
	},
});
