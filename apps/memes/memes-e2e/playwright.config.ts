import { defineConfig, devices } from '@playwright/test';

const mode =
	process.env['E2E_DOCKER'] === 'true' ? 'docker' : 'dev';

const port = 4321;
const baseURL = `http://localhost:${port}`;

const commands: Record<string, string> = {
	dev: 'pnpm exec nx dev axum-memes',
	docker: `docker run --rm -p ${port}:${port} memes/axum-memes:0.1.0`,
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
		reuseExistingServer: !process.env['CI'],
		timeout:
			mode === 'docker'
				? 30_000
				: process.env['CI']
					? 600_000
					: 120_000,
	},
});
