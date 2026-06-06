import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';

const workspaceRoot = resolve(__dirname, '../../..');
const port = 4321;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env['CI'],
	retries: process.env['CI'] ? 2 : 0,
	workers: process.env['CI'] ? 1 : undefined,
	reporter: [
		['list'],
		[
			'monocart-reporter',
			{
				name: 'astro-cryptothrone E2E + Coverage',
				outputFile: './test-results/monocart/index.html',
				coverage: {
					sourceFilter: (sourcePath: string) =>
						sourcePath.includes('src/') &&
						!sourcePath.includes('.spec.'),
					reports: [
						['console-summary'],
						['html'],
						['lcovonly', { file: 'lcov.info' }],
					],
					onEnd: (results: {
						summary?: { lines?: { pct?: number } };
					}) => {
						const pct = results?.summary?.lines?.pct ?? 0;
						const min = Number(process.env['COVERAGE_MIN'] ?? '85');
						if (pct < min) {
							console.error(
								`\n✘ Line coverage ${pct}% is below the required ${min}% threshold\n`,
							);
							process.exit(1);
						}
						console.log(
							`\n✓ Line coverage ${pct}% meets the ${min}% threshold\n`,
						);
					},
				},
			},
		],
	],
	use: {
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'dev',
			use: {
				...devices['Desktop Chrome'],
				baseURL,
			},
		},
		{
			name: 'firefox',
			use: {
				...devices['Desktop Firefox'],
				baseURL,
			},
		},
		{
			name: 'webkit',
			use: {
				...devices['Desktop Safari'],
				baseURL,
			},
		},
		{
			name: 'mobile-safari',
			use: {
				...devices['iPhone 13'],
				baseURL,
			},
		},
		{
			name: 'mobile-chrome',
			use: {
				...devices['Pixel 7'],
				baseURL,
			},
		},
	],
	webServer: {
		command: './kbve.sh -nx astro-cryptothrone:dev',
		cwd: workspaceRoot,
		url: baseURL,
		reuseExistingServer: !process.env['CI'],
		timeout: process.env['CI'] ? 600_000 : 120_000,
		env: { COVERAGE: '1' },
	},
});
