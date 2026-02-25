import { defineConfig, devices } from '@playwright/test';

const mode =
	process.env['E2E_STATIC'] === 'true'
		? 'static'
		: process.env['E2E_PREVIEW'] === 'true'
			? 'preview'
			: 'dev';

const ports = { dev: 4302, preview: 4303, static: 4304 } as const;
const port = ports[mode];
const baseURL = `http://localhost:${port}`;

const commands: Record<string, string> = {
	dev: 'pnpm exec nx dev astro-e2e',
	preview: 'pnpm exec nx preview astro-e2e',
	static: `python3 -m http.server ${port} --directory dist/packages/npm/astro-e2e`,
};

export default defineConfig({
	testDir: './e2e',
	globalTeardown: './e2e/global-teardown.ts',
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
		url: baseURL,
		reuseExistingServer: !process.env['CI'],
		timeout: 120_000,
	},
});
