import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';
import { SERVER_PORT, WEB_URL } from './e2e/env';

const workspaceRoot = resolve(__dirname, '../../../..');

export default defineConfig({
	testDir: './e2e',
	testMatch: 'web.spec.ts',
	fullyParallel: true,
	forbidOnly: !!process.env['CI'],
	retries: process.env['CI'] ? 2 : 0,
	workers: process.env['CI'] ? 1 : undefined,
	reporter: 'html',
	use: { baseURL: WEB_URL, trace: 'on-first-retry' },
	projects: [
		{
			name: 'arpg-web',
			use: { ...devices['Desktop Chrome'], baseURL: WEB_URL },
		},
	],
	webServer: {
		command: `PUBLIC_ARPG_GAME_WS=ws://localhost:${SERVER_PORT}/ws PUBLIC_SUPABASE_URL=https://supabase.kbve.com ./kbve.sh -nx arpg:web-dev`,
		cwd: workspaceRoot,
		url: WEB_URL,
		reuseExistingServer: false,
		timeout: process.env['CI'] ? 600_000 : 180_000,
	},
});
