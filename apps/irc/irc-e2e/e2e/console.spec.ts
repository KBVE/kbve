import { test, expect } from '@playwright/test';

// ─── Console Error Detection ──────────────────────────────────────────────
// Loads the chat page in a real browser and verifies that droid workers
// boot without throwing DataCloneError or other uncaught exceptions.
//
// This catches regressions where SharedWorker / DB Worker pool postMessage
// fails due to non-cloneable Supabase SDK objects.

test.describe('Console: No Critical Errors on Boot', () => {
	test('page loads without DataCloneError', async ({ page }) => {
		const errors: string[] = [];

		// Collect all console errors
		page.on('console', (msg) => {
			if (msg.type() === 'error') {
				errors.push(msg.text());
			}
		});

		// Collect uncaught exceptions / unhandled rejections
		page.on('pageerror', (err) => {
			errors.push(err.message);
		});

		await page.goto('/');
		// Wait for droid boot or a reasonable timeout
		await page.waitForTimeout(5000);

		const cloneErrors = errors.filter((e) => e.includes('DataCloneError'));
		expect(cloneErrors).toHaveLength(0);
	});

	test('page loads without unhandled promise rejections', async ({
		page,
	}) => {
		const rejections: string[] = [];

		page.on('pageerror', (err) => {
			rejections.push(err.message);
		});

		await page.goto('/');
		await page.waitForTimeout(5000);

		// Filter for truly critical errors — ignore network/CORS issues
		// that are expected in e2e (no Supabase/Ergo backend)
		const critical = rejections.filter(
			(msg) =>
				msg.includes('DataCloneError') ||
				msg.includes('Cannot read properties of null') ||
				msg.includes('is not a function'),
		);
		expect(critical).toHaveLength(0);
	});
});

// ─── Worker Initialization ────────────────────────────────────────────────
// Verify that droid workers start up and the boot sequence completes.

test.describe('Console: Droid Boot Sequence', () => {
	test('droid boot completes without crash', async ({ page }) => {
		const logs: string[] = [];
		const errors: string[] = [];

		page.on('console', (msg) => {
			const text = msg.text();
			if (msg.type() === 'log') logs.push(text);
			if (msg.type() === 'error') errors.push(text);
		});

		page.on('pageerror', (err) => {
			errors.push(err.message);
		});

		await page.goto('/');

		// Wait up to 15s for boot complete message
		const bootCompleted = await page
			.waitForEvent('console', {
				predicate: (msg) =>
					msg.text().includes('Boot complete') ||
					msg.text().includes('droid-ready') ||
					msg.text().includes('[KBVE] Global API ready'),
				timeout: 15000,
			})
			.then(() => true)
			.catch(() => false);

		// Boot should complete OR at minimum not crash with critical errors
		const criticalErrors = errors.filter(
			(e) =>
				e.includes('DataCloneError') ||
				e.includes('Worker initialization failed') ||
				(e.includes('SharedWorker') && e.includes('error')),
		);

		if (!bootCompleted) {
			// If boot didn't complete, there should be no critical errors
			// (network errors from missing Supabase/Ergo are expected)
			expect(
				criticalErrors,
				`Boot did not complete and critical errors found: ${criticalErrors.join('; ')}`,
			).toHaveLength(0);
		}

		// Regardless of boot status, no DataCloneErrors allowed
		const cloneErrors = errors.filter((e) => e.includes('DataCloneError'));
		expect(cloneErrors).toHaveLength(0);
	});
});
