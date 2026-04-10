import { describe, it, expect } from 'vitest';
import { dockerExec, dockerExecSafe, dockerWriteFile } from './helpers/docker';

describe('kbve-kubectl CLI', () => {
	it('should print version with info subcommand', () => {
		const out = dockerExec('kbve-kubectl info');
		expect(out).toContain('kbve-kubectl v');
		expect(out).toContain('kubectl:');
	});

	it('should report all expected tools in info', () => {
		const out = dockerExec('kbve-kubectl info');
		expect(out).toContain('kubectl:');
		expect(out).toContain('curl:');
		expect(out).toContain('jq:');
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

	it('should show subcommand help for guest-exec', () => {
		const out = dockerExec('kbve-kubectl guest-exec --help');
		expect(out).toContain('--vm');
		expect(out).toContain('--namespace');
		expect(out).toContain('--command');
		expect(out).toContain('--timeout');
	});

	it('should show subcommand help for run', () => {
		const out = dockerExec('kbve-kubectl run --help');
		expect(out).toContain('script');
	});

	it('should execute a script via run subcommand', () => {
		dockerWriteFile('/tmp/test.sh', '#!/bin/sh\necho hello-from-run\n');
		dockerExec('chmod +x /tmp/test.sh');
		const out = dockerExec('kbve-kubectl run /tmp/test.sh');
		expect(out).toContain('hello-from-run');
	});

	it('should propagate script exit codes via run subcommand', () => {
		dockerWriteFile('/tmp/exit.sh', '#!/bin/sh\nexit 7\n');
		dockerExec('chmod +x /tmp/exit.sh');
		const result = dockerExecSafe('kbve-kubectl run /tmp/exit.sh');
		expect(result.exitCode).toBe(7);
	});

	it('should pass arguments to run subcommand scripts', () => {
		dockerWriteFile('/tmp/args.sh', '#!/bin/sh\necho first=$1 second=$2\n');
		dockerExec('chmod +x /tmp/args.sh');
		const out = dockerExec('kbve-kubectl run /tmp/args.sh hello world');
		expect(out).toContain('first=hello second=world');
	});

	it('should fail run with non-existent script', () => {
		const result = dockerExecSafe(
			'kbve-kubectl run /tmp/does-not-exist-12345.sh',
		);
		expect(result.exitCode).not.toBe(0);
	});

	it('should fail guest-exec without a running VM (expected)', () => {
		const result = dockerExecSafe(
			'kbve-kubectl guest-exec --vm fake-vm --command echo',
		);
		// No cluster available — should fail but not crash
		expect(result.exitCode).not.toBe(0);
	});

	it('should fail guest-exec with missing required args', () => {
		const result = dockerExecSafe('kbve-kubectl guest-exec');
		expect(result.exitCode).not.toBe(0);
	});

	it('should accept --timeout flag for guest-exec', () => {
		// We can't actually run guest-exec successfully, but the parser
		// should accept the flag without erroring out before kubectl runs.
		const result = dockerExecSafe(
			'kbve-kubectl guest-exec --vm test --command echo --timeout 60',
		);
		// Fails on missing kubectl context, not arg parsing
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).not.toContain('unrecognized');
	});
});
