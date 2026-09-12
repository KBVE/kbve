import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import {
	CONTAINER_NAME,
	dockerExec,
	httpGet,
	httpPostJson,
} from './helpers/docker';

// Functional tests exercise the binaries as the Deployment runs them:
//   - aria2c with --enable-rpc on port 6800
//   - python3 -m http.server on port 8080
//
// Both processes are launched in the background inside the main sleep
// container via `docker exec -d`, and callers hit them over localhost
// using the same container's python3 as the HTTP client (no side
// containers — those had race conditions with netns attachment on some
// Docker backends).

function killByName(pattern: string): void {
	try {
		execSync(
			`docker exec ${CONTAINER_NAME} sh -c "pkill -f '${pattern}' 2>/dev/null || true"`,
			{ stdio: 'ignore' },
		);
	} catch {
		/* noop */
	}
}

async function waitFor(
	check: () => boolean,
	timeoutMs = 15_000,
	intervalMs = 250,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			if (check()) return true;
		} catch {
			// keep polling
		}
		await new Promise((r) => setTimeout(r, intervalMs));
	}
	return false;
}

describe('Functional — aria2 RPC', () => {
	beforeAll(() => {
		killByName('aria2c');
		execSync(
			`docker exec -d ${CONTAINER_NAME} aria2c --enable-rpc=true --rpc-listen-all=true --rpc-listen-port=6800 --rpc-allow-origin-all=true --dir=/tmp`,
			{ stdio: 'ignore' },
		);
	});

	afterAll(() => {
		killByName('aria2c');
	});

	it('should accept JSON-RPC on port 6800', async () => {
		const ready = await waitFor(() => {
			const r = httpPostJson(
				'http://localhost:6800/jsonrpc',
				'{"jsonrpc":"2.0","id":"probe","method":"aria2.getVersion"}',
			);
			return r.exitCode === 0;
		});
		expect(ready).toBe(true);
	});

	it('should report its own version via aria2.getVersion', () => {
		const r = httpPostJson(
			'http://localhost:6800/jsonrpc',
			'{"jsonrpc":"2.0","id":"1","method":"aria2.getVersion"}',
		);
		expect(r.exitCode).toBe(0);
		expect(r.stdout).toMatch(/"version"\s*:\s*"\d+\.\d+\.\d+"/);
	});
});

describe('Functional — python http.server', () => {
	beforeAll(() => {
		killByName('http.server');
		// Probe file to serve.
		dockerExec('sh -c "echo hello-e2e > /downloads/probe.txt"');
		// Bind 0.0.0.0 explicitly — Python 3.12's default dual-stack
		// behaviour can leave the IPv4 side unbound on some platforms.
		execSync(
			`docker exec -d ${CONTAINER_NAME} python3 -m http.server 8080 --bind 0.0.0.0 --directory /downloads`,
			{ stdio: 'ignore' },
		);
	});

	afterAll(() => {
		killByName('http.server');
		try {
			dockerExec('sh -c "rm -f /downloads/probe.txt"');
		} catch {
			/* noop */
		}
	});

	it('should listen on port 8080', async () => {
		const ready = await waitFor(() => {
			const r = httpGet('http://localhost:8080/');
			return r.exitCode === 0;
		});
		expect(ready).toBe(true);
	});

	it('should serve a directory listing at /', () => {
		const r = httpGet('http://localhost:8080/');
		expect(r.exitCode).toBe(0);
		expect(r.stdout.toLowerCase()).toContain('directory listing');
	});

	it('should serve a written probe file with correct content', () => {
		const r = httpGet('http://localhost:8080/probe.txt');
		expect(r.exitCode).toBe(0);
		expect(r.stdout.trim()).toBe('hello-e2e');
	});
});
