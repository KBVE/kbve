export default {
	test: {
		include: ['e2e/**/*.spec.ts'],
		testTimeout: 60_000,
		hookTimeout: 120_000,
		fileParallelism: false,
		pool: 'threads',
		poolOptions: {
			threads: {
				minThreads: 1,
				maxThreads: 1,
			},
		},
	},
};
