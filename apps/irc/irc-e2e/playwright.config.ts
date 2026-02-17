import { defineConfig, devices } from '@playwright/test';

const mode =
	process.env['E2E_DOCKER'] === 'true' ? 'docker' : 'dev';

const port = 4321;
const baseURL = `http://localhost:${port}`;

const jwtSecret = 'e2e-test-secret-do-not-use-in-production';

const commands: Record<string, string> = {
	dev: `JWT_SECRET=${jwtSecret} ERGO_WS_URL=ws://localhost:8080 ERGO_IRC_HOST=localhost ERGO_IRC_PORT=6667 cargo run -p irc-gateway`,
	docker: `docker run --rm -p ${port}:${port} -e JWT_SECRET=${jwtSecret} kbve/irc-gateway:0.1.0`,
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
