import { describe, it, expect } from 'vitest';
import { dockerExec, dockerExecSafe } from './helpers/docker';

describe('kbve-kubectl CLI', () => {
	it('should print version with info subcommand', () => {
		const out = dockerExec('kbve-kubectl info');
		expect(out).toContain('kbve-kubectl v');
		expect(out).toContain('kubectl:');
	});

	it('should show help with --help', () => {
		const out = dockerExec('kbve-kubectl --help');
		expect(out).toContain('guest-exec');
		expect(out).toContain('run');
		expect(out).toContain('info');
	});

	it('should show version with --version', () => {
		const out = dockerExec('kbve-kubectl --version');
		expect(out).toMatch(/kbve-kubectl \d+\.\d+\.\d+/);
	});

	it('should fail gracefully with unknown subcommand', () => {
		const result = dockerExecSafe('kbve-kubectl nonexistent');
		expect(result.exitCode).not.toBe(0);
	});

	it('should execute a script via run subcommand', () => {
		const out = dockerExec(
			'/bin/sh -c "echo \'#!/bin/sh\necho hello-from-run\' > /tmp/test.sh && chmod +x /tmp/test.sh && kbve-kubectl run /tmp/test.sh"',
		);
		expect(out).toContain('hello-from-run');
	});

	it('should fail guest-exec without a running VM (expected)', () => {
		const result = dockerExecSafe(
			'kbve-kubectl guest-exec --vm fake-vm --command echo',
		);
		// No cluster available — should fail but not crash
		expect(result.exitCode).not.toBe(0);
	});
});
