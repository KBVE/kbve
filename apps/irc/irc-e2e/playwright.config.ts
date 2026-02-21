import { defineConfig, devices } from '@playwright/test';

const port = 4321;
const baseURL = `http://localhost:${port}`;

const jwtSecret = 'e2e-test-secret-do-not-use-in-production';

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
			name: 'dev',
			use: {
				...devices['Desktop Chrome'],
				baseURL,
			},
		},
	],
	webServer: {
		command: `JWT_SECRET=${jwtSecret} ./kbve.sh -nx irc-gateway:dev`,
		url: `${baseURL}/health`,
		reuseExistingServer: false,
		timeout: process.env['CI'] ? 600_000 : 120_000,
	},
});
