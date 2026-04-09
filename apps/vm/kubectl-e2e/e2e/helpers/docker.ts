import { execSync } from 'node:child_process';

const CONTAINER_NAME = 'kubectl-e2e';
const IMAGE_NAME = 'kbve/kubectl:e2e';

/**
 * Run a command inside the kubectl container and return stdout.
 * Throws if the command exits non-zero.
 */
export function dockerExec(cmd: string): string {
	return execSync(`docker exec ${CONTAINER_NAME} ${cmd}`, {
		encoding: 'utf-8',
		timeout: 15_000,
	}).trim();
}

/**
 * Run a command inside the kubectl container, returning exit code + output.
 * Does NOT throw on non-zero exit.
 */
export function dockerExecSafe(cmd: string): {
	exitCode: number;
	stdout: string;
	stderr: string;
} {
	try {
		const stdout = execSync(`docker exec ${CONTAINER_NAME} ${cmd}`, {
			encoding: 'utf-8',
			timeout: 15_000,
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
			stdout: (err.stdout ?? '').trim(),
			stderr: (err.stderr ?? '').trim(),
		};
	}
}

export { CONTAINER_NAME, IMAGE_NAME };
