import { describe, it, expect } from 'vitest';
import { dockerExec, dockerExecSafe } from './helpers/docker';

describe('Shell', () => {
	it('should have /bin/sh available', () => {
		const out = dockerExec('/bin/sh -c "echo hello"');
		expect(out).toBe('hello');
	});

	it('should have busybox with common utilities', () => {
		const out = dockerExec('busybox --list');
		const utils = out.split('\n');
		expect(utils).toContain('sh');
		expect(utils).toContain('sed');
		expect(utils).toContain('grep');
		expect(utils).toContain('wget');
	});

	it('should execute inline shell scripts', () => {
		// Single quotes prevent host shell from expanding $i before docker exec runs.
		const out = dockerExec("/bin/sh -c 'for i in 1 2 3; do echo $i; done'");
		expect(out).toBe('1\n2\n3');
	});

	it('should support environment variable expansion', () => {
		const out = dockerExec("/bin/sh -c 'export FOO=bar && echo $FOO'");
		expect(out).toBe('bar');
	});

	it('should run as non-root user (uid 10001)', () => {
		const out = dockerExec('id -u');
		expect(out).toBe('10001');
	});

	it('should run as appgroup (gid 10001)', () => {
		const out = dockerExec('id -g');
		expect(out).toBe('10001');
	});

	it('should have a working /tmp directory', () => {
		const out = dockerExec(
			"/bin/sh -c 'echo test-content > /tmp/e2e-test && cat /tmp/e2e-test && rm /tmp/e2e-test'",
		);
		expect(out).toBe('test-content');
	});

	it('should support pipes between commands', () => {
		const out = dockerExec("/bin/sh -c 'echo hello world | wc -w'");
		expect(out.trim()).toBe('2');
	});

	it('should support command substitution', () => {
		const out = dockerExec("/bin/sh -c 'echo $(echo nested)'");
		expect(out).toBe('nested');
	});

	it('should propagate exit codes correctly', () => {
		const result = dockerExecSafe("/bin/sh -c 'exit 42'");
		expect(result.exitCode).toBe(42);
	});

	it('should support conditional logic', () => {
		const out = dockerExec(
			"/bin/sh -c 'if [ 1 -eq 1 ]; then echo yes; else echo no; fi'",
		);
		expect(out).toBe('yes');
	});

	it('should have a writable working directory at /app', () => {
		const out = dockerExec(
			"/bin/sh -c 'cd /app && touch e2e-write-test && ls e2e-write-test && rm e2e-write-test'",
		);
		expect(out).toBe('e2e-write-test');
	});
});
