import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['e2e/**/*.spec.ts'],
		globalSetup: ['e2e/globalSetup.ts'],
		testTimeout: 30_000,
		hookTimeout: 60_000,
	},
});
