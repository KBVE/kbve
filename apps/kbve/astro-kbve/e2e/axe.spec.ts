import {
	test,
	expect,
	mockSupaSession,
	mockArgoApi,
} from './fixtures/auth-mock';
import { runAxe } from './fixtures/axe';

test.describe('a11y — dashboards', () => {
	test('argo dashboard (authenticated)', async ({ page }) => {
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
		await page.goto('/dashboard/argo/', { waitUntil: 'load' });
		await expect(page.locator('button.kbve-argo-row').first()).toBeVisible({
			timeout: 30_000,
		});
		await runAxe(page);
	});

	test('argo dashboard (sign-in gate)', async ({ page }) => {
		await page.goto('/dashboard/argo/', { waitUntil: 'load' });
		await expect(page.getByText('Sign In Required')).toBeVisible({
			timeout: 30_000,
		});
		await runAxe(page);
	});
});

test.describe('a11y — homepage', () => {
	test('home renders without serious/critical violations', async ({
		page,
	}) => {
		await page.goto('/', { waitUntil: 'load' });
		await runAxe(page);
	});
});
