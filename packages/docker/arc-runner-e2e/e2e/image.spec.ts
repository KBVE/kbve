import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import {
	dockerExec,
	dockerExecSafe,
	dockerExecScript,
	IMAGE_NAME,
} from './helpers/docker';

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
		expect(out).toMatch(/^dbmate (v|version )?\d+\.\d+/);
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

describe('arc-runner image — regression guards', () => {
	it('uncompressed image stays under 2 GiB', () => {
		const raw = execSync(
			`docker image inspect ${IMAGE_NAME} --format '{{.Size}}'`,
			{ encoding: 'utf-8' },
		).trim();
		const bytes = Number.parseInt(raw, 10);
		expect(bytes).toBeGreaterThan(500 * 1024 * 1024);
		expect(bytes).toBeLessThan(2 * 1024 * 1024 * 1024);
	});

	it('docker history reports 30 layers or fewer', () => {
		const raw = execSync(
			`docker history --no-trunc --format '{{.ID}}' ${IMAGE_NAME}`,
			{ encoding: 'utf-8' },
		).trim();
		const layers = raw.split('\n').length;
		expect(layers).toBeLessThanOrEqual(30);
	});
});

describe('arc-runner image — network primitives', () => {
	it('resolves github.com via DNS', () => {
		const out = dockerExecScript(`
			getent hosts github.com | awk 'NR==1 { print $2 }'
		`);
		expect(out).toBe('github.com');
	});

	it('curl validates TLS chain against api.github.com', () => {
		// Confirms ca-certificates from the Dockerfile bake is wired into
		// curl's default trust store. Network-dependent — relies on ARC
		// runner egress allowing HTTPS to api.github.com.
		const out = dockerExecScript(`
			curl -sSf -o /dev/null -w '%{http_code}' https://api.github.com
		`);
		expect(out).toBe('200');
	});
});

describe('arc-runner image — install hygiene', () => {
	it('apt list directory was cleared at build time', () => {
		const out = dockerExecScript(`
			find /var/lib/apt/lists -type f 2>/dev/null | wc -l
		`);
		expect(Number.parseInt(out, 10)).toBe(0);
	});

	it('gh CLI keyring is present with mode 0644', () => {
		const out = dockerExecScript(`
			test -f /etc/apt/keyrings/githubcli-archive-keyring.gpg
			stat -c '%a' /etc/apt/keyrings/githubcli-archive-keyring.gpg
		`);
		expect(out).toBe('644');
	});

	it('gh CLI apt source line is registered', () => {
		const out = dockerExec(
			"bash -lc 'cat /etc/apt/sources.list.d/github-cli.list'",
		);
		expect(out).toContain('https://cli.github.com/packages');
	});
});

describe('arc-runner image — kubectl runtime parse', () => {
	it('kubectl parses a synthesised kubeconfig and reports kind=Config', () => {
		// Beyond `kubectl version --client`: ensures the binary can read
		// a YAML kubeconfig, walk through the structure, and emit JSON.
		// ci-dbmate-deploy templates a kubeconfig at runtime and pipes
		// it into kubectl, so the parse path actually matters.
		const out = dockerExecScript(`
			D=$(mktemp -d)
			cat > "$D/kc.yaml" <<'YAML'
apiVersion: v1
kind: Config
current-context: fake
clusters:
- name: fake
  cluster:
    server: https://127.0.0.1:6443
contexts:
- name: fake
  context:
    cluster: fake
    user: fake
users:
- name: fake
  user:
    token: dummy
YAML
			kubectl --kubeconfig="$D/kc.yaml" config view -o json | jq -r .kind
			rm -rf "$D"
		`);
		expect(out).toBe('Config');
	});
});

describe('arc-runner image — locale + unicode', () => {
	it('bash + wc handle multi-byte UTF-8 characters', () => {
		const out = dockerExecScript(`
			LC_ALL=C.UTF-8 LANG=C.UTF-8 printf 'café' | LC_ALL=C.UTF-8 LANG=C.UTF-8 wc -m
		`);
		expect(out.trim()).toBe('4');
	});
});

describe('arc-runner image — PATH + binary modes + sudoers', () => {
	it('/usr/local/bin is on PATH', () => {
		const out = dockerExec("bash -lc 'echo $PATH'");
		expect(out.split(':')).toContain('/usr/local/bin');
	});

	it('which kubectl resolves to /usr/local/bin', () => {
		const out = dockerExec("bash -lc 'command -v kubectl'");
		expect(out).toBe('/usr/local/bin/kubectl');
	});

	it('which dbmate resolves to /usr/local/bin', () => {
		const out = dockerExec("bash -lc 'command -v dbmate'");
		expect(out).toBe('/usr/local/bin/dbmate');
	});

	it('kubectl + dbmate are mode 0755 owned by root:root', () => {
		const out = dockerExecScript(`
			stat -c '%n %a %U:%G' /usr/local/bin/kubectl /usr/local/bin/dbmate
		`);
		expect(out).toContain('/usr/local/bin/kubectl 755 root:root');
		expect(out).toContain('/usr/local/bin/dbmate 755 root:root');
	});

	it('/etc/sudoers is mode 0440 owned by root:root', () => {
		const out = dockerExecScript(`
			stat -c '%a %U:%G' /etc/sudoers
		`);
		expect(out).toBe('440 root:root');
	});
});

describe('arc-runner image — filesystem writes', () => {
	it('/tmp is mode 1777 (world-writable sticky)', () => {
		const out = dockerExec('bash -lc "stat -c \'%a\' /tmp"');
		expect(out).toBe('1777');
	});

	it('runner user can write to /tmp', () => {
		const out = dockerExecScript(`
			su -s /bin/bash runner -c 'F=$(mktemp); echo hi > "$F"; cat "$F"; rm "$F"'
		`);
		expect(out).toBe('hi');
	});

	it('runner user can write to its home directory', () => {
		const out = dockerExecScript(`
			su -s /bin/bash runner -c 'F=/home/runner/.probe-$$; echo ok > "$F"; cat "$F"; rm "$F"'
		`);
		expect(out).toBe('ok');
	});

	it('/home/runner is owned by the runner user', () => {
		const out = dockerExec('bash -lc "stat -c \'%U\' /home/runner"');
		expect(out).toBe('runner');
	});
});

describe('arc-runner image — tool version floors', () => {
	it('git is at least 2.40 (LFS smudge needs recent git)', () => {
		const raw = dockerExec("bash -lc 'git --version'");
		const match = raw.match(/git version (\d+)\.(\d+)/);
		expect(match).not.toBeNull();
		const major = Number.parseInt(match![1], 10);
		const minor = Number.parseInt(match![2], 10);
		expect(major).toBeGreaterThanOrEqual(2);
		if (major === 2) {
			expect(minor).toBeGreaterThanOrEqual(40);
		}
	});

	it('upstream actions-runner ships Node >= 20 under externals/', () => {
		// Actions runtime executes JS actions via the bundled node under
		// /home/runner/externals/node20/. Falling below 20 would break
		// every JS-based GitHub Action that targets the runtime.
		const raw = dockerExecScript(`
			NODE=$(ls -d /home/runner/externals/node* 2>/dev/null | grep -v alpine | sort -V | tail -1)
			test -n "$NODE"
			"$NODE/bin/node" --version
		`);
		const match = raw.match(/^v(\d+)\./);
		expect(match).not.toBeNull();
		expect(Number.parseInt(match![1], 10)).toBeGreaterThanOrEqual(20);
	});
});

describe('arc-runner image — clock sanity', () => {
	it('date returns an ISO-8601 UTC timestamp within 60s of the host', () => {
		const containerIso = dockerExec(
			"bash -lc 'date -u +%Y-%m-%dT%H:%M:%SZ'",
		);
		expect(containerIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
		const containerEpoch = Date.parse(containerIso);
		const driftMs = Math.abs(containerEpoch - Date.now());
		// 60s drift catches a broken timesync or wrong-TZ bind without
		// flaking on normal NTP jitter.
		expect(driftMs).toBeLessThan(60_000);
	});
});

describe('arc-runner image — CLI subcommand surfaces', () => {
	it('gh CLI exposes the api / auth / pr / run subcommands', () => {
		const out = dockerExec("bash -lc 'gh --help'");
		for (const sub of ['api', 'auth', 'pr', 'run', 'release']) {
			expect(out).toMatch(new RegExp(`^\\s+${sub}\\b`, 'm'));
		}
	});

	it('dbmate exposes the migration lifecycle subcommands', () => {
		const out = dockerExec("bash -lc 'dbmate --help'");
		for (const sub of ['up', 'down', 'new', 'rollback', 'status']) {
			expect(out).toMatch(new RegExp(`\\b${sub}\\b`));
		}
	});

	it('kubectl plugin list runs without erroring on the empty case', () => {
		// `kubectl plugin list` may exit non-zero when no plugins exist;
		// the wrapper here normalises to 0 + checks stdout content.
		const res = dockerExecSafe(
			"bash -lc 'kubectl plugin list 2>&1 || true'",
		);
		expect(res.exitCode).toBe(0);
		expect(res.stdout).toMatch(/(no plugins|unable to find)/i);
	});
});

describe('arc-runner image — base image identity', () => {
	it('/etc/os-release identifies the image as Ubuntu', () => {
		const out = dockerExec("bash -lc 'grep ^ID= /etc/os-release'");
		expect(out).toBe('ID=ubuntu');
	});

	it('Ubuntu version is at least 22.04 LTS', () => {
		const raw = dockerExec(
			"bash -lc 'grep ^VERSION_ID= /etc/os-release | cut -d= -f2 | tr -d \\\"'",
		);
		const [major] = raw.split('.').map((n) => Number.parseInt(n, 10));
		expect(major).toBeGreaterThanOrEqual(22);
	});

	it('CA bundle has at least 100 certificates installed', () => {
		const out = dockerExec(
			'bash -lc \'ls /etc/ssl/certs | grep -c ".pem\\|.crt"\'',
		);
		expect(Number.parseInt(out, 10)).toBeGreaterThanOrEqual(100);
	});

	it('runs in the UTC timezone', () => {
		// Container date is already covered by the clock-sanity block.
		// This locks the TZ identifier itself so logs + timestamps
		// from inside the runner stay consistent with everything else
		// in the cluster (all KBVE workloads use UTC).
		const out = dockerExec("bash -lc 'date +%Z'");
		expect(out).toBe('UTC');
	});
});

describe('arc-runner image — workflow shell glue', () => {
	it('common coreutils + shell tools are on PATH', () => {
		// Any one missing breaks a wide swath of `run:` shell steps.
		const out = dockerExecScript(`
			for bin in bash sed awk grep find xargs sha256sum base64 printf cut tr head tail wc sort uniq; do
				command -v "$bin" >/dev/null || { echo "MISSING:$bin"; exit 1; }
			done
			echo ok
		`);
		expect(out).toBe('ok');
	});

	it('runner pod has no docker CLI bound directly (DOCKER_HOST goes to DinD)', () => {
		// Architectural assertion: the pod talks to dockerd in the DinD
		// sidecar via tcp://localhost:2376, not via a local docker
		// binary + unix socket. A future bake that installs the docker
		// CLI in this image would hide that contract and let workflows
		// silently fall through to a non-existent local daemon.
		const res = dockerExecSafe("bash -lc 'command -v docker || true'");
		expect(res.exitCode).toBe(0);
		expect(res.stdout).toBe('');
	});

	it('runner user can create /home/runner/_work (where jobs check out repos)', () => {
		const out = dockerExecScript(`
			su -s /bin/bash runner -c 'mkdir -p /home/runner/_work/probe && echo ok > /home/runner/_work/probe/p && cat /home/runner/_work/probe/p && rm -rf /home/runner/_work/probe'
		`);
		expect(out).toBe('ok');
	});
});

describe('arc-runner image — OCI metadata', () => {
	it('preserves the OCI labels set in the Dockerfile', () => {
		const raw = execSync(
			`docker image inspect ${IMAGE_NAME} --format '{{json .Config.Labels}}'`,
			{ encoding: 'utf-8' },
		).trim();
		const labels = JSON.parse(raw) as Record<string, string>;
		expect(labels['org.opencontainers.image.source']).toBe(
			'https://github.com/kbve/kbve',
		);
		expect(labels['org.opencontainers.image.licenses']).toBe('MIT');
		expect(labels['org.opencontainers.image.description']).toMatch(
			/arc-runner-set/,
		);
	});

	it('reports linux/amd64 (single-arch guard)', () => {
		const raw = execSync(
			`docker image inspect ${IMAGE_NAME} --format '{{.Os}}/{{.Architecture}}'`,
			{ encoding: 'utf-8' },
		).trim();
		expect(raw).toBe('linux/amd64');
	});
});

describe('arc-runner image — security surface', () => {
	it('SUID binary set is bounded and contains only expected entries', () => {
		// A new SUID binary appearing after a Dockerfile edit is almost
		// always a packaging mistake. Allow-list the upstream Ubuntu
		// defaults (sudo, mount, su, etc); fail on anything else.
		const raw = dockerExecScript(`
			find / -xdev -perm -4000 -type f 2>/dev/null | sort
		`);
		const found = raw.split('\n').filter(Boolean);
		const allowed = new Set([
			'/usr/bin/chfn',
			'/usr/bin/chsh',
			'/usr/bin/gpasswd',
			'/usr/bin/mount',
			'/usr/bin/newgrp',
			'/usr/bin/passwd',
			'/usr/bin/su',
			'/usr/bin/sudo',
			'/usr/bin/umount',
			'/usr/lib/dbus-1.0/dbus-daemon-launch-helper',
			'/usr/lib/openssh/ssh-keysign',
			'/usr/lib/polkit-1/polkit-agent-helper-1',
			'/usr/libexec/openssh/ssh-keysign',
		]);
		const unexpected = found.filter((p) => !allowed.has(p));
		expect(unexpected).toEqual([]);
	});
});

describe('arc-runner image — actions-runner agent structure', () => {
	it('Runner.Listener binary survives the layered build', () => {
		// /home/runner/run.sh execs bin/Runner.Listener; without it the
		// pod registers but cannot pick up jobs. A future apt clean-up
		// or COPY that strips the bin/ tree surfaces here.
		const out = dockerExec(
			"bash -lc 'test -f /home/runner/bin/Runner.Listener && echo present'",
		);
		expect(out).toBe('present');
	});

	it('Runner.Worker binary survives the layered build', () => {
		const out = dockerExec(
			"bash -lc 'test -f /home/runner/bin/Runner.Worker && echo present'",
		);
		expect(out).toBe('present');
	});
});

describe('arc-runner image — archive + runtime ergonomics', () => {
	it('tar + gzip round-trip a directory through .tar.gz', () => {
		// Parallel to the existing xz round-trip — gzip is the most
		// common archive format inside CI shell glue (cache save, SDK
		// distribution). Catches a regression that strips gzip from
		// the apt-install list.
		const out = dockerExecScript(`
			D=$(mktemp -d)
			mkdir -p "$D/src"
			echo payload > "$D/src/file.txt"
			tar -C "$D" -czf "$D/out.tar.gz" src
			mkdir "$D/dst"
			tar -C "$D/dst" -xzf "$D/out.tar.gz"
			cat "$D/dst/src/file.txt"
			rm -rf "$D"
		`);
		expect(out).toBe('payload');
	});

	it('default umask is 0022 (group + world readable, not writable)', () => {
		const out = dockerExec("bash -lc 'umask'");
		expect(out).toBe('0022');
	});

	it('ulimit -n is at least 65536 for parallel HTTP + file workloads', () => {
		// game-ci, vitest, and the Bevy build all open many fds at once.
		// The DinD sidecar sets nofile to 1048576; the runner container
		// inherits the same daemon limit.
		const out = dockerExec("bash -lc 'ulimit -n'");
		const n = Number.parseInt(out, 10);
		expect(n).toBeGreaterThanOrEqual(65536);
	});
});
