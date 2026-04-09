export default {
	test: {
		include: ['e2e/**/*.spec.ts'],
		testTimeout: 30_000,
		hookTimeout: 60_000,
		fileParallelism: true,
		pool: 'threads',
		poolOptions: {
			threads: {
				minThreads: 2,
				maxThreads: 4,
			},
		},
		globalSetup: ['e2e/global-setup.ts'],
	},
};
