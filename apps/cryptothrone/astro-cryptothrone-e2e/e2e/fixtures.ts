import { test as base } from '@playwright/test';
import { addCoverageReport } from 'monocart-reporter';

/**
 * Auto-collects Istanbul coverage (window.__coverage__, injected by
 * vite-plugin-istanbul when COVERAGE=1) on Chromium and feeds it to
 * monocart-reporter. Other engines run the same assertions without coverage.
 */
export const test = base.extend<{ autoCoverage: void }>({
	autoCoverage: [
		async ({ page, browserName }, use) => {
			await use();

			if (browserName !== 'chromium') return;

			const coverage = await page
				.evaluate(
					() =>
						(window as Window & { __coverage__?: unknown })
							.__coverage__,
				)
				.catch(() => undefined);

			if (coverage) {
				await addCoverageReport(coverage, test.info());
			}
		},
		{ scope: 'test', auto: true },
	],
});

export { expect } from '@playwright/test';
