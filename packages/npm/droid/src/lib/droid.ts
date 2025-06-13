export async function droid(opts?: { workerURLs?: Record<string, string> }): Promise<{ initialized: boolean }> {
	console.log('[DROID]: droid<T>');
	const { main } = await import('./workers/main.js');
	await main({ workerURLs: opts?.workerURLs });
	console.log('[DROID]: droid<T> => await WorkerURLs');
	return { initialized: true };
}