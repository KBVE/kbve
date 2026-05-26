import { execSync } from 'child_process';

const CONTAINER = process.env.FACTORIO_CONTAINER ?? 'agones-factorio-e2e';

export function dockerLogs(container = CONTAINER): string {
	return execSync(`docker logs ${container} 2>&1`, {
		encoding: 'utf8',
		maxBuffer: 32 * 1024 * 1024,
	});
}

export function dockerRunning(container = CONTAINER): boolean {
	try {
		const out = execSync(
			`docker inspect -f '{{.State.Running}}' ${container}`,
			{
				encoding: 'utf8',
			},
		).trim();
		return out === 'true';
	} catch {
		return false;
	}
}
