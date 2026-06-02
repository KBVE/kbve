import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';

const port = Number(process.env['E2E_PORT'] ?? 4321);
const baseURL = `http://localhost:${port}`;
const distDir = resolve(__dirname, '../../../dist/apps/astro-kbve');

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
		{
			name: 'webkit',
			use: { ...devices['Desktop Safari'] },
		},
		{
			name: 'mobile-chrome',
			use: { ...devices['Pixel 7'] },
		},
		{
			name: 'mobile-safari',
			use: { ...devices['iPhone 14'] },
		},
	],
	webServer: {
		command: `python3 -m http.server ${port} --directory "${distDir}"`,
		url: baseURL,
		reuseExistingServer: !process.env['CI'],
		timeout: 60_000,
		stdout: 'pipe',
		stderr: 'pipe',
	},
});
