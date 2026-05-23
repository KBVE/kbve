import { execSync } from 'child_process';

const CONTAINER = process.env.LOBBY_CONTAINER ?? 'mc-lobby-e2e';

export function dockerLogs(container = CONTAINER): string {
	return execSync(`docker logs ${container} 2>&1`, {
		encoding: 'utf8',
		maxBuffer: 32 * 1024 * 1024,
	});
}

export function dockerExec(cmd: string, container = CONTAINER): string {
	return execSync(
		`docker exec ${container} sh -c '${cmd.replace(/'/g, "'\\''")}' 2>&1`,
		{
			encoding: 'utf8',
			maxBuffer: 8 * 1024 * 1024,
		},
	);
}
