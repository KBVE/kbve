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
		const out = dockerExec('/bin/sh -c "for i in 1 2 3; do echo $i; done"');
		expect(out).toBe('1\n2\n3');
	});

	it('should support environment variable expansion', () => {
		const out = dockerExec('/bin/sh -c "export FOO=bar && echo $FOO"');
		expect(out).toBe('bar');
	});

	it('should run as non-root user (uid 10001)', () => {
		const out = dockerExec('id -u');
		expect(out).toBe('10001');
	});
});
