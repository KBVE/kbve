import { defineConfig } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const workspaceRoot = resolve(__dirname, '../../..');
const port = Number(process.env['E2E_PORT']) || 4322;
const baseURL = `http://localhost:${port}`;

const cargoToml = readFileSync(
	resolve(workspaceRoot, 'apps/discordsh/discordsh-bot/Cargo.toml'),
	'utf-8',
);
const version = cargoToml.match(/^version\s*=\s*"(.+)"/m)?.[1] ?? '0.1.0';

const killPort = `docker rm -f discordsh-bot-e2e-test 2>/dev/null; lsof -ti:${port} | xargs kill -9 2>/dev/null; sleep 1;`;

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env['CI'],
	retries: process.env['CI'] ? 2 : 0,
	workers: process.env['CI'] ? 1 : undefined,
	reporter: 'html',
	use: {
		baseURL,
	},
	projects: [
		{
			name: 'docker',
			use: { baseURL },
		},
	],
	webServer: {
		command: `${killPort} docker run --rm --name discordsh-bot-e2e-test -e HEALTH_PORT=${port} -p ${port}:${port} kbve/discordsh-bot:${version}`,
		url: `${baseURL}/health`,
		reuseExistingServer: false,
		timeout: 60_000,
	},
	globalTeardown: resolve(__dirname, 'docker-teardown.ts'),
});
