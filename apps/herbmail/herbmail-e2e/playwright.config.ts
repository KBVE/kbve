import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'fs';

const mode =
	process.env['E2E_DOCKER'] === 'true' ? 'docker' : 'dev';

const port = 4321;
const baseURL = `http://localhost:${port}`;

const cargoToml = readFileSync('apps/herbmail/axum-herbmail/Cargo.toml', 'utf-8');
const version = cargoToml.match(/^version\s*=\s*"(.+)"/m)?.[1] ?? '0.1.0';

const killPort = `lsof -ti:${port} | xargs kill -9 2>/dev/null; sleep 1;`;

const commands: Record<string, string> = {
	dev: 'nx dev axum-herbmail --no-cloud',
	docker: `${killPort} docker run --rm --name herbmail-e2e-test -p ${port}:${port} kbve/herbmail:${version}`,
};

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
			name: mode,
			use: {
				...devices['Desktop Chrome'],
				baseURL,
			},
		},
	],
	webServer: {
		command: commands[mode],
		url: `${baseURL}/health`,
		reuseExistingServer: mode === 'dev' && !process.env['CI'],
		timeout:
			mode === 'docker'
				? 30_000
				: process.env['CI']
					? 600_000
					: 120_000,
	},
});
