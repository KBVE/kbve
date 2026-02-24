import { test, expect } from '@playwright/test';

test.describe('Rapid-fire event emission', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/edge-cases');
		await page
			.getByTestId('rapid-fire-test')
			.waitFor({ state: 'visible', timeout: 10_000 });
		// Wait for droid init (emits auto droid-ready) then clear
		await page.waitForFunction(() => !!(window as any).kbve?.api, {
			timeout: 10_000,
		});
		await page.getByTestId('clear-rapid').click();
		await expect(page.getByTestId('rapid-log')).toHaveAttribute(
			'data-count',
			'0',
		);
	});

	test('starts with no events', async ({ page }) => {
		await expect(page.getByTestId('rapid-empty')).toBeVisible();
		await expect(page.getByTestId('rapid-log')).toHaveAttribute(
			'data-count',
			'0',
		);
	});

	test('captures all 20 events from burst emission', async ({ page }) => {
		await page.getByTestId('emit-burst').click();

		await expect(page.getByTestId('rapid-log')).toHaveAttribute(
			'data-count',
			'20',
			{
				timeout: 5_000,
			},
		);

		// Verify all entries are droid-ready
		for (let i = 0; i < 20; i++) {
			await expect(page.getByTestId(`rapid-entry-${i}`)).toHaveAttribute(
				'data-event',
				'droid-ready',
			);
		}
	});

	test('preserves event ordering in burst', async ({ page }) => {
		await page.getByTestId('emit-burst').click();

		await expect(page.getByTestId('rapid-log')).toHaveAttribute(
			'data-count',
			'20',
			{
				timeout: 5_000,
			},
		);

		// Each event has an incrementing timestamp — verify ordering via payload
		const entries: { timestamp: number }[] = [];
		for (let i = 0; i < 20; i++) {
			const text = await page
				.getByTestId(`rapid-entry-${i}`)
				.textContent();
			const match = text?.match(/"timestamp":(\d+)/);
			expect(match).toBeTruthy();
			entries.push({ timestamp: Number(match![1]) });
		}

		for (let i = 1; i < entries.length; i++) {
			expect(entries[i].timestamp).toBeGreaterThanOrEqual(
				entries[i - 1].timestamp,
			);
		}
	});

	test('captures mixed burst with correct event types in order', async ({
		page,
	}) => {
		await page.getByTestId('emit-mixed-burst').click();

		await expect(page.getByTestId('rapid-log')).toHaveAttribute(
			'data-count',
			'10',
			{
				timeout: 5_000,
			},
		);

		const expectedOrder = [
			'droid-ready',
			'panel-open',
			'panel-close',
			'panel-open',
			'panel-close',
			'panel-open',
			'panel-close',
			'panel-open',
			'panel-close',
			'droid-mod-ready',
		];

		for (let i = 0; i < expectedOrder.length; i++) {
			await expect(page.getByTestId(`rapid-entry-${i}`)).toHaveAttribute(
				'data-event',
				expectedOrder[i],
			);
		}
	});

	test('clear resets after burst', async ({ page }) => {
		await page.getByTestId('emit-burst').click();
		await expect(page.getByTestId('rapid-log')).toHaveAttribute(
			'data-count',
			'20',
			{
				timeout: 5_000,
			},
		);

		await page.getByTestId('clear-rapid').click();

		await expect(page.getByTestId('rapid-log')).toHaveAttribute(
			'data-count',
			'0',
		);
		await expect(page.getByTestId('rapid-empty')).toBeVisible();
	});
});

test.describe('Panel event directions', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/edge-cases');
		await page
			.getByTestId('rapid-fire-test')
			.waitFor({ state: 'visible', timeout: 10_000 });
		await page.waitForFunction(() => !!(window as any).kbve?.api, {
			timeout: 10_000,
		});
		await page.getByTestId('clear-rapid').click();
		await expect(page.getByTestId('rapid-log')).toHaveAttribute(
			'data-count',
			'0',
		);
	});

	test('captures all 4 panel directions for open and close', async ({
		page,
	}) => {
		await page.getByTestId('emit-all-panels').click();

		await expect(page.getByTestId('rapid-log')).toHaveAttribute(
			'data-count',
			'8',
			{
				timeout: 5_000,
			},
		);

		// First 4 should be panel-open with top, right, bottom, left
		const openDirs = ['top', 'right', 'bottom', 'left'];
		for (let i = 0; i < 4; i++) {
			const entry = page.getByTestId(`rapid-entry-${i}`);
			await expect(entry).toHaveAttribute('data-event', 'panel-open');
			await expect(entry).toContainText(`"id":"${openDirs[i]}"`);
		}

		// Next 4 should be panel-close with same directions
		for (let i = 0; i < 4; i++) {
			const entry = page.getByTestId(`rapid-entry-${i + 4}`);
			await expect(entry).toHaveAttribute('data-event', 'panel-close');
			await expect(entry).toContainText(`"id":"${openDirs[i]}"`);
		}
	});
});

test.describe('droid-mod-ready event', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/edge-cases');
		await page
			.getByTestId('rapid-fire-test')
			.waitFor({ state: 'visible', timeout: 10_000 });
		await page.waitForFunction(() => !!(window as any).kbve?.api, {
			timeout: 10_000,
		});
		await page.getByTestId('clear-rapid').click();
		await expect(page.getByTestId('rapid-log')).toHaveAttribute(
			'data-count',
			'0',
		);
	});

	test('captures droid-mod-ready with full meta', async ({ page }) => {
		await page.getByTestId('emit-mod-ready').click();

		await expect(page.getByTestId('rapid-log')).toHaveAttribute(
			'data-count',
			'1',
			{
				timeout: 5_000,
			},
		);

		const entry = page.getByTestId('rapid-entry-0');
		await expect(entry).toHaveAttribute('data-event', 'droid-mod-ready');
		await expect(entry).toContainText('"name":"edge-mod"');
		await expect(entry).toContainText('"version":"2.5.0"');
	});

	test('captures droid-mod-ready with minimal payload (no meta)', async ({
		page,
	}) => {
		await page.getByTestId('emit-mod-ready-minimal').click();

		await expect(page.getByTestId('rapid-log')).toHaveAttribute(
			'data-count',
			'1',
			{
				timeout: 5_000,
			},
		);

		const entry = page.getByTestId('rapid-entry-0');
		await expect(entry).toHaveAttribute('data-event', 'droid-mod-ready');
		await expect(entry).toContainText('timestamp');
	});
});

test.describe('Event accumulation across interactions', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/edge-cases');
		await page
			.getByTestId('rapid-fire-test')
			.waitFor({ state: 'visible', timeout: 10_000 });
		await page.waitForFunction(() => !!(window as any).kbve?.api, {
			timeout: 10_000,
		});
		await page.getByTestId('clear-rapid').click();
		await expect(page.getByTestId('rapid-log')).toHaveAttribute(
			'data-count',
			'0',
		);
	});

	test('accumulates events from multiple burst clicks', async ({ page }) => {
		await page.getByTestId('emit-burst').click();
		await expect(page.getByTestId('rapid-log')).toHaveAttribute(
			'data-count',
			'20',
			{
				timeout: 5_000,
			},
		);

		await page.getByTestId('emit-mod-ready').click();
		await expect(page.getByTestId('rapid-log')).toHaveAttribute(
			'data-count',
			'21',
			{
				timeout: 5_000,
			},
		);

		// Last entry should be droid-mod-ready
		await expect(page.getByTestId('rapid-entry-20')).toHaveAttribute(
			'data-event',
			'droid-mod-ready',
		);
	});

	test('clear then re-emit starts fresh count', async ({ page }) => {
		await page.getByTestId('emit-all-panels').click();
		await expect(page.getByTestId('rapid-log')).toHaveAttribute(
			'data-count',
			'8',
			{
				timeout: 5_000,
			},
		);

		await page.getByTestId('clear-rapid').click();
		await expect(page.getByTestId('rapid-log')).toHaveAttribute(
			'data-count',
			'0',
		);

		await page.getByTestId('emit-mod-ready').click();
		await expect(page.getByTestId('rapid-log')).toHaveAttribute(
			'data-count',
			'1',
			{
				timeout: 5_000,
			},
		);

		// Index resets to 0
		await expect(page.getByTestId('rapid-entry-0')).toHaveAttribute(
			'data-event',
			'droid-mod-ready',
		);
	});
});
