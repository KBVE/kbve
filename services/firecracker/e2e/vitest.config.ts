export default {
	test: {
		include: ['**/*.spec.ts'],
		testTimeout: 30_000,
		hookTimeout: 60_000,
		// One server, one global concurrency cap (FC_MAX_CONCURRENT_VMS=5).
		// Running spec files in parallel means limits.spec saturating that cap
		// while lifecycle.spec is trying to create a VM, which surfaces as a
		// 429 in a spec that has nothing to do with limits. Serial is the only
		// safe arrangement while the suite drives shared server state.
		fileParallelism: false,
		pool: 'threads',
		poolOptions: {
			threads: {
				minThreads: 1,
				maxThreads: 1,
			},
		},
		globalSetup: ['global-setup.ts'],
	},
};
