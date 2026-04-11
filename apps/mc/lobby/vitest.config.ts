export default {
	test: {
		include: ['e2e/**/*.spec.ts'],
		testTimeout: 30_000,
		hookTimeout: 200_000,
		fileParallelism: false,
		globalSetup: ['e2e/global-setup.ts'],
	},
};
