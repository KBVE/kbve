import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env['E2E_PORT'] ?? 4321);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
	testDir: './e2e',
	fullyParallel: false,
	forbidOnly: !!process.env['CI'],
	retries: process.env['CI'] ? 1 : 0,
	workers: 1,
	reporter: process.env['CI'] ? 'line' : 'list',
	use: {
		trace: 'on-first-retry',
		baseURL,
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
});
