import { describe, it, expect } from 'vitest';
import { dockerExec, dockerExecSafe } from './helpers/docker';

describe('Tools', () => {
	it('should have kubectl available', () => {
		const out = dockerExec('kubectl version --client -o json');
		const parsed = JSON.parse(out);
		expect(parsed.clientVersion).toBeDefined();
		expect(parsed.clientVersion.major).toBe('1');
	});

	it('should run kubectl as a static binary (no missing libs)', () => {
		const result = dockerExecSafe('kubectl --help');
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('kubectl');
	});

	it('should have jq available', () => {
		const out = dockerExec('/bin/sh -c "echo \'{\\"a\\":1}\' | jq .a"');
		expect(out).toBe('1');
	});

	it('should parse complex JSON with jq', () => {
		const out = dockerExec(
			'/bin/sh -c \'echo \\\'{"items":[{"name":"a"},{"name":"b"}]}\\\' | jq -r ".items[].name"\'',
		);
		expect(out).toBe('a\nb');
	});

	it('should have curl available', () => {
		const out = dockerExec('curl --version');
		expect(out).toContain('curl');
	});

	it('should have CA certificates', () => {
		const out = dockerExec('/bin/sh -c "ls /etc/ssl/certs/ | head -1"');
		expect(out.length).toBeGreaterThan(0);
	});

	it('should resolve DNS via curl', () => {
		// Hits a public 204 endpoint to verify DNS + TLS work end-to-end.
		const result = dockerExecSafe(
			'curl -sf -o /dev/null -w "%{http_code}" https://www.gstatic.com/generate_204',
		);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe('204');
	});

	it('should have wget available via busybox', () => {
		const out = dockerExec('wget --help 2>&1 | head -1');
		expect(out.toLowerCase()).toContain('busybox');
	});

	it('should have grep available', () => {
		const out = dockerExec(
			'/bin/sh -c "printf \'foo\\nbar\\nbaz\\n\' | grep -c b"',
		);
		expect(out.trim()).toBe('2');
	});

	it('should have sed available', () => {
		const out = dockerExec(
			"/bin/sh -c \"echo 'hello world' | sed 's/world/kbve/'\"",
		);
		expect(out).toBe('hello kbve');
	});

	it('should have awk available', () => {
		const out = dockerExec(
			"/bin/sh -c \"echo 'a b c' | awk '{print \\$2}'\"",
		);
		expect(out).toBe('b');
	});

	it('should have sleep available', () => {
		const result = dockerExecSafe('sleep 0.1');
		expect(result.exitCode).toBe(0);
	});
});
