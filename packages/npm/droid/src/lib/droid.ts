export async function droid(opts?: { workerURLs?: Record<string, string> }): Promise<{ initialized: boolean }> {
	const { main } = await import('./workers/main');
	await main({ workerURLs: opts?.workerURLs });
	return { initialized: true };
}