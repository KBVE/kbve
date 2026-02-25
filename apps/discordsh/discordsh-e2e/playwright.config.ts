import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';

const workspaceRoot = resolve(__dirname, '../../..');
const port = 4321;
const baseURL = `http://localhost:${port}`;

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
			testIgnore: /toast-welcome/,
			use: {
				...devices['Desktop Chrome'],
				baseURL,
			},
		},
	],
	webServer: {
		command: './kbve.sh -nx axum-discordsh:dev',
		cwd: workspaceRoot,
		url: `${baseURL}/health`,
		reuseExistingServer: false,
		timeout: process.env['CI'] ? 600_000 : 120_000,
	},
});
