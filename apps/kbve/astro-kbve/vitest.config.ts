import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
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
