import { isolationReport } from './isolation';

// Boot log so isolation status is visible in the console on both local vite and the
// itch build. Physics availability follows directly from `sharedMemory`.
export function verifySab(): void {
	console.info(`[sab] ${isolationReport()}`);
}
