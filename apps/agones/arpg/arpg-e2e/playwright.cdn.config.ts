import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';
import { WEB_PORT, WEB_URL } from './e2e/env';

const workspaceRoot = resolve(__dirname, '../../../..');

// `nx run arpg:container-web` tags the image :latest; override with ARPG_WEB_TAG
// in CI to point at a versioned build.
const tag = process.env['ARPG_WEB_TAG'] ?? 'latest';

const killPort = `lsof -ti:${WEB_PORT} | xargs kill -9 2>/dev/null; docker rm -f arpg-web-e2e 2>/dev/null; sleep 1;`;

export default defineConfig({
	testDir: './e2e',
	testMatch: 'cdn.spec.ts',
	fullyParallel: true,
	forbidOnly: !!process.env['CI'],
	retries: process.env['CI'] ? 2 : 0,
	workers: process.env['CI'] ? 1 : undefined,
	reporter: 'html',
	use: { baseURL: WEB_URL, trace: 'on-first-retry' },
	projects: [
		{
			name: 'arpg-cdn',
			use: { ...devices['Desktop Chrome'], baseURL: WEB_URL },
		},
	],
	webServer: {
		command: `${killPort} docker run --rm --name arpg-web-e2e -p ${WEB_PORT}:${WEB_PORT} kbve/arpg-web:${tag}`,
		cwd: workspaceRoot,
		url: WEB_URL,
		reuseExistingServer: false,
		timeout: 60_000,
	},
});
