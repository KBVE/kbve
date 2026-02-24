export async function droid(opts?: {
	workerURLs?: Record<string, string>;
	workerRefs?: {
		canvasWorker?: Worker;
		dbWorker?: SharedWorker;
		wsWorker?: SharedWorker;
	};
	i18nPath?: string;
	dataPath?: string;
}): Promise<{ initialized: boolean }> {
	console.log('[DROID]: droid<T>');

	const { main } = await import('./workers/main.js');

	await main({
		workerURLs: opts?.workerURLs,
		workerRefs: opts?.workerRefs,
		i18nPath: opts?.i18nPath,
		dataPath: opts?.dataPath,
	});

	console.log('[DROID]: droid<T> => await WorkerRefs + URLs');

	return { initialized: true };
}
