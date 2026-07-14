import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';
import { JWT_SECRET, SERVER_PORT } from './e2e/env';

const workspaceRoot = resolve(__dirname, '../../../..');

export default defineConfig({
	testDir: './e2e',
	testMatch: 'server.spec.ts',
	fullyParallel: false,
	forbidOnly: !!process.env['CI'],
	retries: process.env['CI'] ? 2 : 0,
	workers: 1,
	reporter: 'html',
	use: { trace: 'on-first-retry' },
	projects: [{ name: 'arpg-server', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: `SUPABASE_JWT_SECRET=${JWT_SECRET} ARPG_SERVER_ADDR=0.0.0.0:${SERVER_PORT} ./kbve.sh -nx arpg-server:run`,
		cwd: workspaceRoot,
		url: `http://localhost:${SERVER_PORT}/healthz`,
		reuseExistingServer: false,
		timeout: process.env['CI'] ? 600_000 : 180_000,
	},
});
