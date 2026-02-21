import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'fs';

const port = 4321;
const baseURL = `http://localhost:${port}`;

const cargoToml = readFileSync('apps/herbmail/axum-herbmail/Cargo.toml', 'utf-8');
const version = cargoToml.match(/^version\s*=\s*"(.+)"/m)?.[1] ?? '0.1.0';

const killPort = `lsof -ti:${port} | xargs kill -9 2>/dev/null; sleep 1;`;

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env['CI'],
	retries: process.env['CI'] ? 2 : 0,
	workers: process.env['CI'] ? 1 : undefined,
	reporter: 'html',
	use: {
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'docker',
			use: {
				...devices['Desktop Chrome'],
				baseURL,
			},
		},
	],
	webServer: {
		command: `${killPort} docker run --rm --name herbmail-e2e-test -p ${port}:${port} kbve/herbmail:${version}`,
		url: `${baseURL}/health`,
		reuseExistingServer: false,
		timeout: 30_000,
	},
});
