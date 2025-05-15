export async function droid(opts?: { canvas?: boolean }): Promise<{ initialized: boolean }> {
	const { main } = await import('./workers/main');
	await main();
	return { initialized: true };
}