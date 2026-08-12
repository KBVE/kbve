export default {
	test: {
		include: ['e2e/**/*.spec.ts'],
		testTimeout: 30_000,
		hookTimeout: 240_000,
		fileParallelism: false,
	},
};
