import { test, expect } from '@playwright/test';

test.describe('UIUX Panel Controls', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('nav-events').click();
		await page.getByTestId('event-bus-test').waitFor({ state: 'visible' });
	});

	test('all panels start closed', async ({ page }) => {
		for (const id of ['top', 'right', 'bottom', 'left']) {
			await expect(page.getByTestId(`toggle-panel-${id}`)).toHaveAttribute('data-state', 'closed');
		}
	});

	test('opening a panel emits panel-open event', async ({ page }) => {
		await page.getByTestId('toggle-panel-right').click();

		await expect(page.getByTestId('toggle-panel-right')).toHaveAttribute('data-state', 'open');
		await expect(page.getByTestId('event-log')).toHaveAttribute('data-count', '1');

		const entry = page.getByTestId('event-entry-0');
		await expect(entry).toHaveAttribute('data-event', 'panel-open');
	});

	test('closing a panel emits panel-close event', async ({ page }) => {
		// Open first
		await page.getByTestId('toggle-panel-left').click();
		await expect(page.getByTestId('toggle-panel-left')).toHaveAttribute('data-state', 'open');

		// Close
		await page.getByTestId('toggle-panel-left').click();
		await expect(page.getByTestId('toggle-panel-left')).toHaveAttribute('data-state', 'closed');

		await expect(page.getByTestId('event-log')).toHaveAttribute('data-count', '2');

		const closeEntry = page.getByTestId('event-entry-1');
		await expect(closeEntry).toHaveAttribute('data-event', 'panel-close');
	});

	test('toggle cycles open/close state', async ({ page }) => {
		const btn = page.getByTestId('toggle-panel-top');

		// Start closed
		await expect(btn).toHaveAttribute('data-state', 'closed');

		// Toggle open
		await btn.click();
		await expect(btn).toHaveAttribute('data-state', 'open');

		// Toggle closed
		await btn.click();
		await expect(btn).toHaveAttribute('data-state', 'closed');

		// Toggle open again
		await btn.click();
		await expect(btn).toHaveAttribute('data-state', 'open');
	});

	test('multiple panels can be open simultaneously', async ({ page }) => {
		await page.getByTestId('toggle-panel-top').click();
		await page.getByTestId('toggle-panel-bottom').click();

		await expect(page.getByTestId('toggle-panel-top')).toHaveAttribute('data-state', 'open');
		await expect(page.getByTestId('toggle-panel-bottom')).toHaveAttribute('data-state', 'open');
		await expect(page.getByTestId('toggle-panel-left')).toHaveAttribute('data-state', 'closed');
		await expect(page.getByTestId('toggle-panel-right')).toHaveAttribute('data-state', 'closed');
	});

	test('panel events contain correct panel id', async ({ page }) => {
		await page.getByTestId('toggle-panel-bottom').click();

		const entry = page.getByTestId('event-entry-0');
		await expect(entry).toContainText('"id":"bottom"');
	});
});
