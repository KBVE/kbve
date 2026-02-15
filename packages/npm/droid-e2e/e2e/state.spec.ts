import { test, expect } from '@playwright/test';

test.describe('State Management', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('nav-state').click();
		await page.getByTestId('state-test').waitFor({ state: 'visible' });
	});

	test.describe('Auth Store', () => {
		test('starts with loading tone', async ({ page }) => {
			await expect(page.getByTestId('auth-tone')).toHaveText('loading');
		});

		test('setAuth updates auth state', async ({ page }) => {
			await page.getByTestId('auth-set').click();

			await expect(page.getByTestId('auth-tone')).toHaveText('auth');
			await expect(page.getByTestId('auth-name')).toHaveText('Test User');
			await expect(page.getByTestId('auth-id')).toHaveText('user-123');
		});

		test('resetAuth clears to anon', async ({ page }) => {
			await page.getByTestId('auth-set').click();
			await expect(page.getByTestId('auth-tone')).toHaveText('auth');

			await page.getByTestId('auth-reset').click();

			await expect(page.getByTestId('auth-tone')).toHaveText('anon');
			await expect(page.getByTestId('auth-name')).toHaveText('');
			await expect(page.getByTestId('auth-id')).toHaveText('');
		});
	});

	test.describe('Router Store', () => {
		test('reflects current path', async ({ page }) => {
			await expect(page.getByTestId('router-path')).toHaveText('/');
		});
	});

	test.describe('Tooltip', () => {
		test('starts with no tooltip', async ({ page }) => {
			await expect(page.getByTestId('tooltip-active')).toHaveText('none');
		});

		test('opens and closes tooltip', async ({ page }) => {
			await page.getByTestId('tooltip-open-help').click();
			await expect(page.getByTestId('tooltip-active')).toHaveText('help');

			await page.getByTestId('tooltip-close').click();
			await expect(page.getByTestId('tooltip-active')).toHaveText('none');
		});

		test('opening a new tooltip replaces the old one', async ({ page }) => {
			await page.getByTestId('tooltip-open-help').click();
			await expect(page.getByTestId('tooltip-active')).toHaveText('help');

			await page.getByTestId('tooltip-open-info').click();
			await expect(page.getByTestId('tooltip-active')).toHaveText('info');
		});
	});

	test.describe('Drawer', () => {
		test('starts closed', async ({ page }) => {
			await expect(page.getByTestId('drawer-state')).toHaveText('closed');
		});

		test('opens and closes', async ({ page }) => {
			await page.getByTestId('drawer-open').click();
			await expect(page.getByTestId('drawer-state')).toHaveText('open');

			await page.getByTestId('drawer-close').click();
			await expect(page.getByTestId('drawer-state')).toHaveText('closed');
		});

		test('opening drawer closes tooltip', async ({ page }) => {
			await page.getByTestId('tooltip-open-help').click();
			await expect(page.getByTestId('tooltip-active')).toHaveText('help');

			await page.getByTestId('drawer-open').click();
			await expect(page.getByTestId('tooltip-active')).toHaveText('none');
		});
	});

	test.describe('Modal', () => {
		test('starts with no modal', async ({ page }) => {
			await expect(page.getByTestId('modal-id')).toHaveText('none');
		});

		test('opens and closes modal', async ({ page }) => {
			await page.getByTestId('modal-open-settings').click();
			await expect(page.getByTestId('modal-id')).toHaveText('settings');

			await page.getByTestId('modal-close').click();
			await expect(page.getByTestId('modal-id')).toHaveText('none');
		});

		test('opening modal closes drawer and tooltip', async ({ page }) => {
			await page.getByTestId('drawer-open').click();
			await page.getByTestId('tooltip-open-help').click();
			await expect(page.getByTestId('drawer-state')).toHaveText('open');
			await expect(page.getByTestId('tooltip-active')).toHaveText('help');

			await page.getByTestId('modal-open-confirm').click();

			await expect(page.getByTestId('modal-id')).toHaveText('confirm');
			await expect(page.getByTestId('drawer-state')).toHaveText('closed');
			await expect(page.getByTestId('tooltip-active')).toHaveText('none');
		});

		test('switching modals updates the id', async ({ page }) => {
			await page.getByTestId('modal-open-settings').click();
			await expect(page.getByTestId('modal-id')).toHaveText('settings');

			await page.getByTestId('modal-open-confirm').click();
			await expect(page.getByTestId('modal-id')).toHaveText('confirm');
		});
	});
});
