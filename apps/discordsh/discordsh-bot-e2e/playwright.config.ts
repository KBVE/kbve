import { defineConfig } from '@playwright/test';

const port = Number(process.env['E2E_PORT']) || 4322;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env['CI'],
	retries: process.env['CI'] ? 2 : 0,
	workers: process.env['CI'] ? 1 : undefined,
	reporter: 'html',
	use: {
		baseURL,
	},
	projects: [
		{
			name: 'smoke',
			use: { baseURL },
		},
	],
	webServer: {
		command: `HEALTH_PORT=${port} cargo run -p discordsh-bot`,
		url: `${baseURL}/health`,
		reuseExistingServer: !process.env['CI'],
		timeout: 120_000,
	},
});
