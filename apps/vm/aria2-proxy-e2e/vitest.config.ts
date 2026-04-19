export default {
	test: {
		include: ['e2e/**/*.spec.ts'],
		testTimeout: 30_000,
		hookTimeout: 60_000,
		fileParallelism: false,
		pool: 'threads',
		poolOptions: {
			threads: {
				minThreads: 1,
				maxThreads: 2,
			},
		},
	},
};
