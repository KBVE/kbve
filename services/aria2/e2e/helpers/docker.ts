import { execSync } from 'node:child_process';

const CONTAINER_NAME = 'aria2-proxy-e2e';
const IMAGE_NAME = 'kbve/aria2-proxy:latest';

/**
 * Run a command inside the aria2-proxy container and return stdout.
 * Throws if the command exits non-zero.
 */
export function dockerExec(cmd: string): string {
	return execSync(`docker exec ${CONTAINER_NAME} ${cmd}`, {
		encoding: 'utf-8',
		timeout: 15_000,
	}).trim();
}

/**
 * Run a command inside the aria2-proxy container, returning exit code + output.
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

/**
 * HTTP GET against a localhost URL from INSIDE the main container, using
 * the packaged python3. Avoids spinning up side containers (which have
 * race conditions with network namespace attachment on some Docker
 * backends) and doesn't require curl/wget in the image itself.
 *
 * Returns the raw response body as text, or an error payload if the
 * request failed.
 */
export function httpGet(url: string): {
	exitCode: number;
	stdout: string;
	stderr: string;
} {
	const py = [
		'import sys, urllib.request',
		`r = urllib.request.urlopen('${url}', timeout=5)`,
		"sys.stdout.write(r.read().decode('utf-8', errors='replace'))",
	].join('; ');
	return dockerExecSafe(`python3 -c "${py}"`);
}

/**
 * HTTP POST (JSON) against a localhost URL from INSIDE the main container.
 */
export function httpPostJson(
	url: string,
	body: string,
): { exitCode: number; stdout: string; stderr: string } {
	// Base64-encode the JSON body so we don't fight shell quoting in the
	// generated python one-liner.
	const b64 = Buffer.from(body, 'utf-8').toString('base64');
	const py = [
		'import sys, base64, urllib.request',
		`data = base64.b64decode('${b64}')`,
		`req = urllib.request.Request('${url}', data=data, method='POST', headers={'Content-Type':'application/json'})`,
		'r = urllib.request.urlopen(req, timeout=5)',
		"sys.stdout.write(r.read().decode('utf-8', errors='replace'))",
	].join('; ');
	return dockerExecSafe(`python3 -c "${py}"`);
}

export { CONTAINER_NAME, IMAGE_NAME };
