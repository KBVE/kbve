import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.HERBMAIL_E2E_PORT ?? 4399);

export default defineConfig({
	testDir: './e2e',
	timeout: 120_000,
	expect: { timeout: 30_000 },
	fullyParallel: false,
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'list' : 'line',
	use: {
		baseURL: `http://localhost:${PORT}`,
		screenshot: 'only-on-failure',
		launchOptions: {
			args: [
				'--use-gl=angle',
				'--use-angle=metal',
				'--enable-unsafe-swiftshader',
			],
		},
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
	],
	webServer: {
		command: `pnpm exec vite preview --config apps/herbmail/herbmail-game/vite.config.ts --port ${PORT} --strictPort`,
		cwd: '../../..',
		port: PORT,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
