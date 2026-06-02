import {
	test,
	expect,
	mockSupaSession,
	mockArgoApi,
} from './fixtures/auth-mock';

const ARGO_URL = '/dashboard/argo/';

test.describe('argo dashboard — unauthenticated', () => {
	test('renders Sign In Required gate without a session', async ({
		page,
	}) => {
		await page.goto(ARGO_URL, { waitUntil: 'load' });
		await expect(page.getByText('Sign In Required')).toBeVisible({
			timeout: 30_000,
		});
	});
});

test.describe('argo dashboard — authenticated', () => {
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

	test('app rows render as buttons with aria-expanded=false', async ({
		page,
	}) => {
		await page.goto(ARGO_URL, { waitUntil: 'load' });
		const rows = page.locator('button.kbve-argo-row');
		await expect(rows.first()).toBeVisible({ timeout: 30_000 });
		const count = await rows.count();
		expect(count).toBeGreaterThanOrEqual(2);
		for (let i = 0; i < count; i++) {
			await expect(rows.nth(i)).toHaveAttribute('aria-expanded', 'false');
		}
	});

	test('tapping an app row flips aria-expanded to true', async ({ page }) => {
		await page.goto(ARGO_URL, { waitUntil: 'load' });
		const firstRow = page.locator('button.kbve-argo-row').first();
		await expect(firstRow).toBeVisible({ timeout: 30_000 });
		await expect(firstRow).toHaveAttribute('aria-expanded', 'false');
		await firstRow.click();
		await expect(firstRow).toHaveAttribute('aria-expanded', 'true');
	});

	test('Project + Last Sync columns hide under 768px', async ({
		page,
		isMobile,
	}) => {
		await page.goto(ARGO_URL, { waitUntil: 'load' });
		await expect(page.locator('button.kbve-argo-row').first()).toBeVisible({
			timeout: 30_000,
		});
		const project = page.locator('.kbve-argo-col-project').first();
		const lastSync = page.locator('.kbve-argo-col-last').first();
		const viewportWidth = page.viewportSize()?.width ?? 0;
		const mobile = isMobile || (viewportWidth > 0 && viewportWidth <= 768);
		if (mobile) {
			await expect(project).toBeHidden();
			await expect(lastSync).toBeHidden();
		} else {
			await expect(project).toBeVisible();
			await expect(lastSync).toBeVisible();
		}
	});
});
