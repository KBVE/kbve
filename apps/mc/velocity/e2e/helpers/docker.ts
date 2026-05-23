import { execSync } from 'child_process';

const CONTAINER = process.env.VELOCITY_CONTAINER ?? 'mc-velocity-e2e';

export function dockerLogs(container = CONTAINER): string {
	return execSync(`docker logs ${container} 2>&1`, {
		encoding: 'utf8',
		maxBuffer: 32 * 1024 * 1024,
	});
}
