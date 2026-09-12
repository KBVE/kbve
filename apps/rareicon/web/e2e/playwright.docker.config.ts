import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env['AXUM_PORT'] ?? 4325);
const host = process.env['AXUM_HOST'] ?? '127.0.0.1';
const baseURL = `http://${host}:${port}`;

// Runs the astro smoke suite against a running axum-rareicon container
// (started by axum-rareicon-e2e's `e2e` target). No webServer — container must
// already be up.
export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env['CI'],
	retries: process.env['CI'] ? 2 : 0,
	workers: process.env['CI'] ? 1 : undefined,
	reporter: 'html',
	use: {
		trace: 'on-first-retry',
		baseURL,
	},
	projects: [
		{
			name: 'docker',
			use: {
				...devices['Desktop Chrome'],
			},
		},
	],
});
