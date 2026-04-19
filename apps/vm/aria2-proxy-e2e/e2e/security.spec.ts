import { describe, it, expect } from 'vitest';
import { dockerExec, dockerExecSafe } from './helpers/docker';

describe('Security', () => {
	it('should run as uid 1000 (appuser)', () => {
		const out = dockerExec('id -u');
		expect(out).toBe('1000');
	});

	it('should run as gid 1000 (appgroup)', () => {
		const out = dockerExec('id -g');
		expect(out).toBe('1000');
	});

	it('should have appuser home shell disabled', () => {
		// /sbin/nologin is the shell assigned to appuser in the Dockerfile.
		// Grep the passwd entry to confirm it wasn't silently replaced.
		const out = dockerExec('sh -c "getent passwd appuser | cut -d: -f7"');
		expect(out).toBe('/sbin/nologin');
	});

	it('should own /downloads as 1000:1000', () => {
		const out = dockerExec('stat -c %u:%g /downloads');
		expect(out).toBe('1000:1000');
	});

	it('should have /downloads writable by the running user', () => {
		const out = dockerExec(
			'sh -c "touch /downloads/.e2e-probe && echo ok && rm /downloads/.e2e-probe"',
		);
		expect(out).toBe('ok');
	});

	it('should NOT allow writing to /etc (system dirs read-only for non-root)', () => {
		const result = dockerExecSafe('sh -c "touch /etc/probe 2>&1"');
		expect(result.exitCode).not.toBe(0);
		// Combined stdout+stderr — either field can carry the error
		// depending on shell + busybox version.
		expect((result.stdout + result.stderr).toLowerCase()).toMatch(
			/permission denied|read-only/,
		);
	});

	// Note: privileged port binding (<1024) depends on container capabilities
	// which differ between local Docker (NET_BIND_SERVICE granted by default)
	// and production Kubernetes (`capabilities.drop: ALL` in the Deployment's
	// securityContext). That constraint is validated at the Deployment level,
	// not in image-level e2e.
});
