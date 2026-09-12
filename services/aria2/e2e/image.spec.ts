import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { dockerExec, IMAGE_NAME } from './helpers/docker';

// Image-level smoke tests. The container runs with an overridden entrypoint
// (sleep infinity) so these specs can docker-exec in — these checks confirm
// that the packaged binaries and layout match what the deployment expects.

describe('Image layout', () => {
	it('should have aria2c available', () => {
		const out = dockerExec('aria2c --version');
		// First line is "aria2 version X.Y.Z" — only assert the prefix
		// so Alpine bumping to a newer aria2 patch doesn't break CI.
		expect(out.split('\n')[0]).toMatch(/^aria2 version \d+\.\d+\.\d+/);
	});

	it('should have python3 available', () => {
		const out = dockerExec('python3 --version');
		expect(out).toMatch(/^Python 3\.\d+\.\d+/);
	});

	it('should have tini at /sbin/tini', () => {
		const out = dockerExec('sh -c "test -f /sbin/tini && echo ok"');
		expect(out).toBe('ok');
	});

	it('should have ca-certificates installed', () => {
		// At least one cert file present under /etc/ssl/certs/
		const out = dockerExec('sh -c "ls /etc/ssl/certs/ | head -1"');
		expect(out.length).toBeGreaterThan(0);
	});

	it('should ship python http.server module', () => {
		const out = dockerExec(
			'python3 -c "import http.server; print(\\"ok\\")"',
		);
		expect(out).toBe('ok');
	});
});

describe('Image metadata', () => {
	it('should declare ports 6800 and 8080', () => {
		const raw = execSync(
			`docker inspect ${IMAGE_NAME} --format '{{json .Config.ExposedPorts}}'`,
			{ encoding: 'utf-8' },
		).trim();
		expect(raw).toContain('6800/tcp');
		expect(raw).toContain('8080/tcp');
	});

	it('should declare non-root user 1000:1000 in image config', () => {
		const user = execSync(
			`docker inspect ${IMAGE_NAME} --format '{{.Config.User}}'`,
			{ encoding: 'utf-8' },
		).trim();
		expect(user).toBe('1000:1000');
	});

	it('should set workdir to /downloads', () => {
		const wd = execSync(
			`docker inspect ${IMAGE_NAME} --format '{{.Config.WorkingDir}}'`,
			{ encoding: 'utf-8' },
		).trim();
		expect(wd).toBe('/downloads');
	});

	it('should use tini as entrypoint', () => {
		const ep = execSync(
			`docker inspect ${IMAGE_NAME} --format '{{json .Config.Entrypoint}}'`,
			{ encoding: 'utf-8' },
		).trim();
		expect(ep).toContain('/sbin/tini');
	});
});
