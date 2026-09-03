import { expect, type Page } from '@playwright/test';

export type HudTab = 'Character' | 'Bag' | 'Chat' | 'Map' | 'Social';

export async function waitForHud(page: Page): Promise<void> {
	await expect(page.getByRole('navigation', { name: 'HUD' })).toBeVisible({
		timeout: 20_000,
	});
}

export async function openHudTab(page: Page, label: HudTab): Promise<void> {
	const tab = page.getByRole('button', { name: label, exact: true });
	await expect(tab).toBeVisible({ timeout: 20_000 });
	if ((await tab.getAttribute('aria-pressed')) !== 'true') {
		await tab.click();
	}
	await expect(tab).toHaveAttribute('aria-pressed', 'true');
}
