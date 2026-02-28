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
			use: {
				...devices['Desktop Chrome'],
				baseURL,
			},
		},
	],
	webServer: {
		command: './kbve.sh -nx astro-kbve:dev',
		cwd: workspaceRoot,
		url: baseURL,
		reuseExistingServer: !process.env['CI'],
		timeout: process.env['CI'] ? 600_000 : 120_000,
	},
});
