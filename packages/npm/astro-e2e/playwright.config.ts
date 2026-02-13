import { defineConfig, devices } from '@playwright/test';

const isPreview = process.env['E2E_PREVIEW'] === 'true';

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
			name: isPreview ? 'preview' : 'dev',
			use: {
				...devices['Desktop Chrome'],
				baseURL: isPreview
					? 'http://localhost:4303'
					: 'http://localhost:4302',
			},
		},
	],
	webServer: {
		command: isPreview
			? 'pnpm exec nx preview astro-e2e'
			: 'pnpm exec nx dev astro-e2e',
		url: isPreview
			? 'http://localhost:4303'
			: 'http://localhost:4302',
		reuseExistingServer: !process.env['CI'],
		timeout: 30_000,
	},
});
