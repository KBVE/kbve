import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const workspaceRoot = resolve(__dirname, '../../..');
const port = 4321;
const baseURL = `http://localhost:${port}`;

// Mockoon ports — must match docker-compose-poc-dev.yaml
const GITHUB_MOCK_PORT = 4010;
const DISCORD_MOCK_PORT = 4011;

const cargoToml = readFileSync(
	resolve(workspaceRoot, 'apps/discordsh/axum-discordsh/Cargo.toml'),
	'utf-8',
);
const version = cargoToml.match(/^version\s*=\s*"(.+)"/m)?.[1] ?? '0.1.0';

const composePath = 'apps/discordsh/poc/docker-compose-poc-dev.yaml';

// Kill any leftover containers and ports from previous runs, then start
// the full mock stack. The discordsh service in compose uses the
// already-built local image (kbve/discordsh:{version}).
const cleanup = [
	`docker compose -f ${composePath} down --remove-orphans 2>/dev/null`,
	`lsof -ti:${port} | xargs kill -9 2>/dev/null`,
	`lsof -ti:${GITHUB_MOCK_PORT} | xargs kill -9 2>/dev/null`,
	`lsof -ti:${DISCORD_MOCK_PORT} | xargs kill -9 2>/dev/null`,
].join('; ');

// Override the discordsh image tag via env so docker-compose uses the
// locally built image rather than trying to rebuild from Dockerfile.
const startCmd = [
	cleanup,
	'sleep 1',
	`DISCORDSH_IMAGE=kbve/discordsh:${version} docker compose -f ${composePath} up --abort-on-container-exit`,
].join(' && ');

export default defineConfig({
	testDir: './e2e',
	testMatch: 'mock-api.spec.ts',
	fullyParallel: false,
	forbidOnly: !!process.env['CI'],
	retries: process.env['CI'] ? 2 : 0,
	workers: 1,
	reporter: 'html',
	use: {
		trace: 'on-first-retry',
		baseURL,
	},
	projects: [
		{
			name: 'mock',
			use: {
				...devices['Desktop Chrome'],
				baseURL,
			},
		},
	],
	webServer: {
		command: startCmd,
		cwd: workspaceRoot,
		url: `${baseURL}/health`,
		reuseExistingServer: false,
		timeout: process.env['CI'] ? 300_000 : 120_000,
	},
	globalTeardown: resolve(__dirname, 'mock-teardown.ts'),
});
