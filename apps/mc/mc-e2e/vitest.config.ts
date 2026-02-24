import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['apps/mc/mc-e2e/e2e/**/*.spec.ts'],
		testTimeout: 30_000,
		hookTimeout: 60_000,
	},
});
