import { describe, it, expect } from 'vitest';
import { dockerExec, dockerExecSafe } from './helpers/docker';

describe('Security', () => {
	it('should NOT run as root', () => {
		const out = dockerExec('id -u');
		expect(out).not.toBe('0');
	});

	it('should run as the appuser user', () => {
		const out = dockerExec('id -un');
		expect(out).toBe('appuser');
	});

	it('should run as the appgroup group', () => {
		const out = dockerExec('id -gn');
		expect(out).toBe('appgroup');
	});

	it('should not be able to write to /etc', () => {
		const result = dockerExecSafe(
			"/bin/sh -c 'touch /etc/should-fail 2>&1'",
		);
		expect(result.exitCode).not.toBe(0);
	});

	it('should not be able to write to /usr/local/bin', () => {
		const result = dockerExecSafe(
			"/bin/sh -c 'touch /usr/local/bin/should-fail 2>&1'",
		);
		expect(result.exitCode).not.toBe(0);
	});

	it('should NOT have a writable /root home directory', () => {
		const result = dockerExecSafe(
			"/bin/sh -c 'touch /root/should-fail 2>&1'",
		);
		expect(result.exitCode).not.toBe(0);
	});

	it('should NOT have setuid kubectl binary', () => {
		const out = dockerExec('/bin/sh -c "ls -l /usr/local/bin/kubectl"');
		// First char of permissions: '-' for normal file, no 's' bit
		expect(out).not.toMatch(/^-..s/);
	});

	it('should NOT have setuid kbve-kubectl binary', () => {
		const out = dockerExec(
			'/bin/sh -c "ls -l /usr/local/bin/kbve-kubectl"',
		);
		expect(out).not.toMatch(/^-..s/);
	});

	it('should have a default shell of /sbin/nologin for appuser', () => {
		const out = dockerExec(
			'/bin/sh -c "grep ^appuser /etc/passwd | cut -d: -f7"',
		);
		expect(out).toBe('/sbin/nologin');
	});

	it('should not have sudo installed', () => {
		const result = dockerExecSafe('sudo --version');
		expect(result.exitCode).not.toBe(0);
	});

	it('should not have su installed (or it should be unusable)', () => {
		// Alpine ships su via busybox but appuser cannot escalate
		const result = dockerExecSafe('su root -c "id -u"');
		expect(result.exitCode).not.toBe(0);
	});

	it('should not expose any unnecessary network ports', () => {
		// kbve-kubectl is a CLI, not a server — verify ENTRYPOINT doesn't bind
		const result = dockerExecSafe(
			'/bin/sh -c "netstat -ln 2>/dev/null | grep LISTEN | wc -l"',
		);
		// netstat may not exist on Alpine without procps; either way: 0 listeners
		if (result.exitCode === 0) {
			expect(parseInt(result.stdout.trim(), 10)).toBe(0);
		}
	});
});
