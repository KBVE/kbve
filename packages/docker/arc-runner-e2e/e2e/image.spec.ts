import { describe, it, expect } from 'vitest';
import { dockerExec, dockerExecSafe } from './helpers/docker';

describe('arc-runner image — baked-in tools', () => {
	it('git-lfs is on PATH and reports a version', () => {
		const out = dockerExec("bash -lc 'git-lfs --version'");
		expect(out).toMatch(/^git-lfs\//);
	});

	it('git-lfs install --system was applied at build time', () => {
		// `git-lfs install --system` writes the smudge filter into
		// /etc/gitconfig — confirms the Dockerfile actually ran it.
		const out = dockerExec(
			"bash -lc 'git config --system --get filter.lfs.smudge'",
		);
		expect(out).toContain('git-lfs');
	});

	it('jq runs and parses JSON', () => {
		const out = dockerExec(
			`bash -lc "echo '{\\"k\\":\\"v\\"}' | jq -r .k"`,
		);
		expect(out).toBe('v');
	});

	it('unzip is on PATH', () => {
		const out = dockerExec("bash -lc 'unzip -v | head -1'");
		expect(out).toMatch(/UnZip/);
	});

	it('xz is on PATH', () => {
		const out = dockerExec("bash -lc 'xz --version | head -1'");
		expect(out).toMatch(/xz \(XZ Utils\)/);
	});

	it('gh CLI is on PATH', () => {
		const out = dockerExec("bash -lc 'gh --version | head -1'");
		expect(out).toMatch(/^gh version/);
	});

	it('xz extracts a tar.xz archive end-to-end', () => {
		// Confirms xz is functional, not just present — Unity / butler
		// installers ship .tar.xz, so failing this means matrix legs
		// would die mid-extract even though `xz --version` worked.
		const out = dockerExec(
			`bash -lc "cd /tmp && echo hello > probe.txt && tar -cJf probe.tar.xz probe.txt && rm probe.txt && tar -xJf probe.tar.xz && cat probe.txt"`,
		);
		expect(out).toBe('hello');
	});
});

describe('arc-runner image — runtime layout', () => {
	it('upstream actions-runner entrypoint is present', () => {
		// /home/runner/run.sh is the upstream entrypoint the K8s pod
		// command falls through to — must survive our layered RUN.
		const result = dockerExecSafe(
			"bash -lc 'test -x /home/runner/run.sh && echo present'",
		);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe('present');
	});

	it('externals/ directory is intact for init-dind-externals copy', () => {
		// init container does `cp -r /home/runner/externals/. /tmpDir/`
		// — empty externals would silently no-op and break DinD net.
		const out = dockerExec("bash -lc 'ls /home/runner/externals | wc -l'");
		expect(Number.parseInt(out, 10)).toBeGreaterThan(0);
	});

	it('runner unix user exists with uid/gid 1001', () => {
		const out = dockerExec("bash -lc 'id runner'");
		expect(out).toMatch(/uid=1001/);
		expect(out).toMatch(/gid=\d+\(docker\)|gid=1001/);
	});

	it('sudoers entry baked in lets root sudo without password', () => {
		// We're already running as root; the test is that the line
		// landed in /etc/sudoers, so the K8s pod can drop its
		// `command:` override that injects the same line at runtime.
		const out = dockerExec(
			'bash -lc \'grep "^root ALL=(ALL) NOPASSWD:ALL" /etc/sudoers\'',
		);
		expect(out).toContain('NOPASSWD:ALL');
	});
});
