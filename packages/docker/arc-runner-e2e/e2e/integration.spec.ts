import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { DIND_CONTAINER, RUNNER_CONTAINER } from './helpers/docker';

// Integration tests exercise the runner ↔ DinD wiring used in the
// gha-runner-scale-set pod spec. Both services share the runner's
// network namespace via compose `network_mode: service:runner`, so
// the runner reaches dockerd at localhost:2376 (the same address the
// DOCKER_HOST env var advertises in production).

describe('arc-runner ↔ DinD shared netns', () => {
	it('dind container is up', () => {
		const out = execSync(
			`docker inspect -f '{{.State.Running}}' ${DIND_CONTAINER}`,
			{
				encoding: 'utf-8',
			},
		).trim();
		expect(out).toBe('true');
	});

	it('dockerd accepts TCP connections on localhost:2376 from inside the runner', () => {
		// Runner's DOCKER_HOST is `tcp://localhost:2376`. If this curl
		// fails the production runner container would also fail to
		// talk to its sidecar.
		const out = execSync(
			`docker exec ${RUNNER_CONTAINER} bash -lc "curl -sf http://localhost:2376/_ping"`,
			{ encoding: 'utf-8' },
		).trim();
		expect(out).toBe('OK');
	});

	it('runner can list dockerd images via DOCKER_HOST', () => {
		// Tools the workflow runs (e.g. `docker pull`, `game-ci`) all
		// hit dockerd through the same TCP endpoint. A successful
		// `docker info` call is the smallest version of that flow.
		const out = execSync(
			`docker exec -e DOCKER_HOST=tcp://localhost:2376 ${RUNNER_CONTAINER} bash -lc "apt-get install -y --no-install-recommends docker.io-cli >/dev/null 2>&1 || true; docker --host=tcp://localhost:2376 info --format '{{.ServerVersion}}'"`,
			{ encoding: 'utf-8' },
		).trim();
		// 29.x = the production sidecar pin (docker:29.3.0-dind).
		expect(out).toMatch(/^29\./);
	});
});
