import {
	test,
	expect,
	mockSupaSession,
	mockArgoApi,
} from './fixtures/auth-mock';

test.describe('visual regression — dashboards', () => {
	test.beforeEach(async ({ page }) => {
		await mockSupaSession(page, { staff: true });
		await mockArgoApi(page, [
			{
				name: 'app-alpha',
				project: 'platform',
				syncStatus: 'Synced',
				healthStatus: 'Healthy',
			},
			{
				name: 'app-beta',
				project: 'data',
				syncStatus: 'OutOfSync',
				healthStatus: 'Degraded',
			},
		]);
	});

	test('argo dashboard — full page', async ({ page }) => {
		await page.goto('/dashboard/argo/', { waitUntil: 'load' });
		await expect(page.locator('button.kbve-argo-row').first()).toBeVisible({
			timeout: 30_000,
		});
		await expect(page).toHaveScreenshot('argo-dashboard.png', {
			fullPage: true,
		});
	});

	test('argo dashboard — row expanded', async ({ page }) => {
		await page.goto('/dashboard/argo/', { waitUntil: 'load' });
		const firstRow = page.locator('button.kbve-argo-row').first();
		await expect(firstRow).toBeVisible({ timeout: 30_000 });
		await firstRow.click();
		await expect(firstRow).toHaveAttribute('aria-expanded', 'true');
		await expect(page).toHaveScreenshot('argo-dashboard-expanded.png', {
			fullPage: true,
		});
	});
});

test.describe('visual regression — yuki dock', () => {
	test.beforeEach(async ({ page }) => {
		await mockSupaSession(page);
	});

	test('yuki dock — collapsed', async ({ page }) => {
		await page.goto('/', { waitUntil: 'load' });
		const dock = page.locator('[data-yuki-dock], #yuki-dock').first();
		await expect(dock).toBeVisible({ timeout: 30_000 });
		await expect(dock).toHaveScreenshot('yuki-dock-collapsed.png');
	});
});
