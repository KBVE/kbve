import { defineConfig, devices } from '@playwright/test';

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
				baseURL: 'http://localhost:4302',
			},
		},
		{
			name: 'preview',
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:4303',
			},
		},
	],
	webServer: [
		{
			command: 'npx nx dev astro-e2e',
			url: 'http://localhost:4302',
			reuseExistingServer: !process.env['CI'],
			timeout: 30_000,
		},
		{
			command: 'npx nx preview astro-e2e',
			url: 'http://localhost:4303',
			reuseExistingServer: !process.env['CI'],
			timeout: 30_000,
		},
	],
});
