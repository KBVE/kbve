import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		extensions: [
			'.web.tsx',
			'.web.ts',
			'.web.jsx',
			'.web.js',
			'.tsx',
			'.ts',
			'.jsx',
			'.js',
			'.json',
		],
		alias: {
			'react-native': 'react-native-web',
			'react-native-reanimated': fileURLToPath(
				new URL('./vitest/reanimated-stub.ts', import.meta.url),
			),
			'@kbve/core': fileURLToPath(
				new URL('../core/src/index.ts', import.meta.url),
			),
		},
	},
	test: {
		environment: 'jsdom',
		include: ['**/*.test.ts', '**/*.test.tsx'],
		globals: true,
		server: { deps: { inline: ['react-native-web'] } },
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			include: ['src/**/*.{ts,tsx}'],
			exclude: [
				'src/**/*.test.{ts,tsx}',
				'src/**/__tests__/**',
				'src/**/index.ts',
			],
		},
	},
});
