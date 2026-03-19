import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
		environment: 'jsdom',
		globals: true,
		setupFiles: ['src/test-setup.ts'],
	},
	resolve: {
		alias: {
			// Mock Tauri APIs at resolution level so tests work in CI
			// where @tauri-apps/api is not installed.
			'@tauri-apps/api/core': path.resolve(
				__dirname,
				'src/__mocks__/tauri-api-core.ts',
			),
			'@tauri-apps/api/event': path.resolve(
				__dirname,
				'src/__mocks__/tauri-api-event.ts',
			),
		},
	},
});
