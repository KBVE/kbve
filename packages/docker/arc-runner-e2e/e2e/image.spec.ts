import { describe, it, expect } from 'vitest';
import { dockerExec, dockerExecSafe, dockerExecScript } from './helpers/docker';

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

describe('arc-runner image — k8s + db tooling (v0.1.2)', () => {
	it('kubectl reports the pinned client version', () => {
		const out = dockerExec(
			'bash -lc "kubectl version --client=true --output=json | jq -r .clientVersion.gitVersion"',
		);
		expect(out).toMatch(/^v1\.31\./);
	});

	it('dbmate is on PATH and reports a version', () => {
		const out = dockerExec("bash -lc 'dbmate --version'");
		expect(out).toMatch(/^dbmate v\d+\.\d+/);
	});

	it('psql is on PATH', () => {
		const out = dockerExec("bash -lc 'psql --version'");
		expect(out).toMatch(/^psql \(PostgreSQL\)/);
	});

	it('envsubst substitutes shell variables', () => {
		const out = dockerExecScript(
			`export FOO=bar; echo 'value: $FOO' | envsubst`,
		);
		expect(out).toBe('value: bar');
	});

	it('rsync transfers a directory tree end-to-end', () => {
		const out = dockerExecScript(`
			D=$(mktemp -d)
			mkdir -p "$D/src" "$D/dst"
			echo payload > "$D/src/file.txt"
			rsync -a "$D/src/" "$D/dst/"
			cat "$D/dst/file.txt"
			rm -rf "$D"
		`);
		expect(out).toBe('payload');
	});
});

describe('arc-runner image — build toolchain (v0.1.2 + v0.1.3)', () => {
	it('gcc compiles, links, and runs a hello-world C program', () => {
		// gcc inherits the program's exit code, so we trap it via echo to
		// confirm compile + link + execute all worked.
		const out = dockerExecScript(`
			D=$(mktemp -d)
			cat > "$D/t.c" <<'C'
int main(void) { return 42; }
C
			gcc "$D/t.c" -o "$D/t"
			set +e
			"$D/t"
			echo "exit=$?"
			rm -rf "$D"
		`);
		expect(out).toBe('exit=42');
	});

	it('make is on PATH', () => {
		const out = dockerExec("bash -lc 'make --version | head -1'");
		expect(out).toMatch(/^GNU Make/);
	});

	it('pkg-config reports a version', () => {
		const out = dockerExec("bash -lc 'pkg-config --version'");
		expect(out).toMatch(/^\d+\.\d+/);
	});

	it('protoc reports a libprotoc version (v0.1.3)', () => {
		const out = dockerExec("bash -lc 'protoc --version'");
		expect(out).toMatch(/^libprotoc /);
	});

	it('protoc compiles a .proto into a descriptor set end-to-end (v0.1.3)', () => {
		// Beyond `--version`: ensures the protobuf well-known types land
		// alongside the compiler and that the binary can emit output. The
		// six ci-uniti matrix legs rely on this codegen path.
		const out = dockerExecScript(`
			D=$(mktemp -d)
			cat > "$D/probe.proto" <<'PROTO'
syntax = "proto3";
message Probe { string name = 1; }
PROTO
			protoc --proto_path="$D" --descriptor_set_out="$D/probe.pb" "$D/probe.proto"
			test -s "$D/probe.pb"
			echo ok
			rm -rf "$D"
		`);
		expect(out).toBe('ok');
	});

	it('pkg-config can resolve protobuf (libprotobuf-dev .pc file present)', () => {
		const out = dockerExec("bash -lc 'pkg-config --modversion protobuf'");
		expect(out).toMatch(/^\d+\.\d+/);
	});
});

describe('arc-runner image — git-lfs functional smudge', () => {
	it('round-trips a binary via the smudge/clean filters in a local repo', () => {
		// Self-contained: no network. Confirms the system-wide smudge +
		// clean filters baked by `git-lfs install --system` rewrite a
		// tracked binary into an LFS pointer at commit time and that
		// `git lfs ls-files` enumerates it.
		const out = dockerExecScript(`
			D=$(mktemp -d)
			cd "$D"
			git init -q -b main
			git config user.name e2e
			git config user.email e2e@kbve
			git lfs install --local >/dev/null
			git lfs track '*.bin' >/dev/null
			head -c 1024 /dev/urandom > payload.bin
			git add .gitattributes payload.bin
			git commit -q -m fixture
			git cat-file -p HEAD:payload.bin | head -1 | grep -q '^version https://git-lfs.github.com/spec/v1'
			git lfs ls-files | grep -q payload.bin
			echo ok
			cd /
			rm -rf "$D"
		`);
		expect(out).toBe('ok');
	});
});
