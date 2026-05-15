import { execSync } from 'node:child_process';

export const RUNNER_CONTAINER = 'arc-runner-e2e';
export const DIND_CONTAINER = 'arc-runner-e2e-dind';
export const IMAGE_NAME = 'kbve/arc-runner:latest';

/**
 * Run a command inside the runner container, returning trimmed stdout.
 * Throws on non-zero exit.
 */
export function dockerExec(cmd: string, container = RUNNER_CONTAINER): string {
	return execSync(`docker exec ${container} ${cmd}`, {
		encoding: 'utf-8',
		timeout: 30_000,
	}).trim();
}

/**
 * Same as dockerExec but never throws — surfaces exit code + streams.
 */
export function dockerExecSafe(
	cmd: string,
	container = RUNNER_CONTAINER,
): { exitCode: number; stdout: string; stderr: string } {
	try {
		const stdout = execSync(`docker exec ${container} ${cmd}`, {
			encoding: 'utf-8',
			timeout: 30_000,
		}).trim();
		return { exitCode: 0, stdout, stderr: '' };
	} catch (e: unknown) {
		const err = e as {
			status?: number;
			stdout?: string;
			stderr?: string;
		};
		return {
			exitCode: err.status ?? 1,
			stdout: (err.stdout ?? '').toString().trim(),
			stderr: (err.stderr ?? '').toString().trim(),
		};
	}
}

/**
 * Run a multi-line bash script inside the container. Avoids host-shell
 * quoting: the script is base64-encoded, piped via stdin, and decoded +
 * executed inside `bash -c` in the container. Set `errexit` so any
 * intermediate failure surfaces as a non-zero exit instead of silent
 * fall-through.
 */
export function dockerExecScript(
	script: string,
	container = RUNNER_CONTAINER,
	timeoutMs = 60_000,
): string {
	const encoded = Buffer.from(
		`set -euo pipefail\n${script}`,
		'utf-8',
	).toString('base64');
	return execSync(
		`docker exec -i ${container} bash -c "echo ${encoded} | base64 -d | bash"`,
		{ encoding: 'utf-8', timeout: timeoutMs },
	).trim();
}
