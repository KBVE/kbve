export default {
	test: {
		include: ['e2e/**/*.spec.ts'],
		testTimeout: 60_000,
		hookTimeout: 240_000,
		fileParallelism: false,
	},
};
