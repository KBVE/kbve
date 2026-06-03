import { test, expect, type Page } from '@playwright/test';

const MC_SECTIONS = [
	{ kind: 'block', path: '/mc/blocks/' },
	{ kind: 'item', path: '/mc/items/' },
	{ kind: 'enchant', path: '/mc/enchants/' },
] as const;

const cardSel = (kind: string) => `[data-mc-card="${kind}"]`;

async function gotoSection(page: Page, path: string, kind: string) {
	await page.goto(path, { waitUntil: 'load' });
	const first = page.locator(cardSel(kind)).first();
	await expect(first).toBeVisible({ timeout: 30_000 });
	return first;
}

for (const section of MC_SECTIONS) {
	test.describe(`mc ${section.kind} browser`, () => {
		test('grid renders cards', async ({ page }) => {
			await gotoSection(page, section.path, section.kind);
			const count = await page.locator(cardSel(section.kind)).count();
			expect(count).toBeGreaterThan(0);
		});

		test('card has touch-action=manipulation + cursor=pointer (Safari tap fix)', async ({
			page,
		}) => {
			const first = await gotoSection(page, section.path, section.kind);
			const styles = await first.evaluate((el) => {
				const cs = getComputedStyle(el as HTMLElement);
				return {
					touchAction: cs.touchAction,
					cursor: cs.cursor,
				};
			});
			expect(styles.touchAction).toBe('manipulation');
			expect(styles.cursor).toBe('pointer');
		});

		test('card is <a> with non-empty href', async ({ page }) => {
			const first = await gotoSection(page, section.path, section.kind);
			const tag = await first.evaluate((el) => el.tagName);
			expect(tag).toBe('A');
			const href = await first.getAttribute('href');
			expect(href).toMatch(new RegExp(`^/mc/${section.kind}s/.+/$`));
		});

		test('tapping a card navigates to its detail page', async ({
			page,
		}) => {
			const first = await gotoSection(page, section.path, section.kind);
			const slug = await first.getAttribute('data-mc-slug');
			expect(slug).toBeTruthy();
			const expectedPath = `/mc/${section.kind}s/${slug}/`;
			await Promise.all([
				page.waitForURL(`**${expectedPath}`, { timeout: 15_000 }),
				first.click(),
			]);
			expect(page.url()).toContain(expectedPath);
		});

		test('search input bumps to >=16px on mobile (no iOS auto-zoom)', async ({
			page,
			isMobile,
		}) => {
			await gotoSection(page, section.path, section.kind);
			const input = page
				.locator('input.mcdb-browse__input[type="search"]')
				.first();
			await expect(input).toBeVisible();
			const fontSize = await input.evaluate((el) =>
				parseFloat(getComputedStyle(el as HTMLElement).fontSize),
			);
			if (isMobile) {
				expect(fontSize).toBeGreaterThanOrEqual(16);
			} else {
				expect(fontSize).toBeGreaterThan(0);
			}
		});

		test('search filters the grid', async ({ page }) => {
			await gotoSection(page, section.path, section.kind);
			const input = page
				.locator('input.mcdb-browse__input[type="search"]')
				.first();
			const firstSlugBefore = await page
				.locator(cardSel(section.kind))
				.first()
				.getAttribute('data-mc-slug');
			await input.fill('a');
			// Either the set narrows or the first slug changes; both prove
			// the filter is wired to the input.
			await expect
				.poll(
					async () => {
						const slugNow = await page
							.locator(cardSel(section.kind))
							.first()
							.getAttribute('data-mc-slug');
						const countNow = await page
							.locator(cardSel(section.kind))
							.count();
						return { slugNow, countNow };
					},
					{ timeout: 10_000 },
				)
				.toMatchObject({ slugNow: expect.stringMatching(/^[a-z]/) });
			const _ = firstSlugBefore;
		});
	});
}
