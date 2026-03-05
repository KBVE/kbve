export async function droid(opts?: {
	workerURLs?: Record<string, string>;
	workerRefs?: {
		canvasWorker?: Worker;
		dbWorker?: SharedWorker;
		wsWorker?: SharedWorker;
	};
	i18nPath?: string;
	dataPath?: string;
	/** Maximum time (ms) to wait for worker initialization before rejecting. Default: no timeout. */
	initTimeout?: number;
}): Promise<{ initialized: boolean }> {
	console.log('[DROID]: droid<T>');

	const { main } = await import('./workers/main.js');

	const initPromise = main({
		workerURLs: opts?.workerURLs,
		workerRefs: opts?.workerRefs,
		i18nPath: opts?.i18nPath,
		dataPath: opts?.dataPath,
	});

	if (opts?.initTimeout && opts.initTimeout > 0) {
		const timeout = new Promise<never>((_, reject) =>
			setTimeout(
				() =>
					reject(
						new Error(
							`[DROID] Worker init timed out after ${opts.initTimeout}ms`,
						),
					),
				opts.initTimeout,
			),
		);
		await Promise.race([initPromise, timeout]);
	} else {
		await initPromise;
	}

	console.log('[DROID]: droid<T> => await WorkerRefs + URLs');

	return { initialized: true };
}
