export default {
	test: {
		include: ['e2e/**/*.spec.ts'],
		testTimeout: 30_000,
		hookTimeout: 60_000,
		// All spec files are read-only HTTP calls against the same container —
		// safe to run in parallel. globalSetup ensures the server is ready once
		// before any worker starts, so per-file beforeAll(waitForReady()) becomes
		// a fast no-op (server already responds).
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
