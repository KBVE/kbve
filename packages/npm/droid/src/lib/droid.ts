import { main } from './workers/main';

export async function droid(): Promise<{ initialized: boolean }> {
	await main();
	return { initialized: true };
}