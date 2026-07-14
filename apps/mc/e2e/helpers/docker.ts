import { execSync } from 'child_process';

const CONTAINER = process.env.MC_CONTAINER ?? 'mc-e2e';

export function dockerLogs(container = CONTAINER): string {
	return execSync(`docker logs ${container} 2>&1`, {
		encoding: 'utf8',
		maxBuffer: 32 * 1024 * 1024,
	});
}

export function dockerExec(cmd: string, container = CONTAINER): string {
	return execSync(`docker exec ${container} sh -c ${JSON.stringify(cmd)}`, {
		encoding: 'utf8',
		maxBuffer: 32 * 1024 * 1024,
	});
}
