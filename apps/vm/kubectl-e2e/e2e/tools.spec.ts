import { describe, it, expect } from 'vitest';
import { dockerExec } from './helpers/docker';

describe('Tools', () => {
	it('should have kubectl available', () => {
		const out = dockerExec('kubectl version --client -o json');
		const parsed = JSON.parse(out);
		expect(parsed.clientVersion).toBeDefined();
		expect(parsed.clientVersion.major).toBe('1');
	});

	it('should have jq available', () => {
		const out = dockerExec('/bin/sh -c "echo \'{\\"a\\":1}\' | jq .a"');
		expect(out).toBe('1');
	});

	it('should have curl available', () => {
		const out = dockerExec('curl --version');
		expect(out).toContain('curl');
	});

	it('should have CA certificates', () => {
		const out = dockerExec('/bin/sh -c "ls /etc/ssl/certs/ | head -1"');
		expect(out.length).toBeGreaterThan(0);
	});
});
