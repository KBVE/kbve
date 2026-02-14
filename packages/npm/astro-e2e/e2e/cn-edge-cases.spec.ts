import { test, expect } from '@playwright/test';

test.describe('cn() utility edge cases', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/edge-cases');
		await page.getByTestId('cn-edge-test').waitFor({ state: 'visible', timeout: 10_000 });
	});

	test('empty call returns empty string', async ({ page }) => {
		await expect(page.getByTestId('cn-empty')).toHaveAttribute('data-value', '');
	});

	test('single class passes through', async ({ page }) => {
		await expect(page.getByTestId('cn-single-class')).toHaveAttribute('data-value', 'px-4');
	});

	test('undefined input returns empty string', async ({ page }) => {
		await expect(page.getByTestId('cn-undefined-input')).toHaveAttribute('data-value', '');
	});

	test('null input returns empty string', async ({ page }) => {
		await expect(page.getByTestId('cn-null-input')).toHaveAttribute('data-value', '');
	});

	test('false input returns empty string', async ({ page }) => {
		await expect(page.getByTestId('cn-false-input')).toHaveAttribute('data-value', '');
	});

	test('empty string input returns empty string', async ({ page }) => {
		await expect(page.getByTestId('cn-empty-string')).toHaveAttribute('data-value', '');
	});

	test('mixed falsy values with one valid class', async ({ page }) => {
		const result = await page.getByTestId('cn-mixed-falsy').getAttribute('data-value');
		expect(result).toBe('text-red-500');
	});

	test('conditional object applies truthy and skips falsy', async ({ page }) => {
		const result = await page.getByTestId('cn-conditional-object').getAttribute('data-value');
		expect(result).toContain('bg-blue-500');
		expect(result).toContain('text-white');
		expect(result).not.toContain('bg-red-500');
	});

	test('array input is flattened', async ({ page }) => {
		const result = await page.getByTestId('cn-array-input').getAttribute('data-value');
		expect(result).toContain('px-4');
		expect(result).toContain('py-2');
		expect(result).toContain('font-bold');
	});

	test('nested arrays are flattened', async ({ page }) => {
		const result = await page.getByTestId('cn-nested-array').getAttribute('data-value');
		expect(result).toContain('px-4');
		expect(result).toContain('py-2');
		expect(result).toContain('font-bold');
	});

	test('Tailwind conflict: later padding wins', async ({ page }) => {
		const result = await page.getByTestId('cn-tailwind-conflict-padding').getAttribute('data-value');
		expect(result).toContain('px-8');
		expect(result).toContain('py-2');
		expect(result).not.toContain('px-4');
	});

	test('Tailwind conflict: later margin wins', async ({ page }) => {
		const result = await page.getByTestId('cn-tailwind-conflict-margin').getAttribute('data-value');
		expect(result).toContain('mx-6');
		expect(result).toContain('my-4');
		expect(result).not.toContain('mx-2');
	});

	test('Tailwind conflict: later text size wins, color preserved', async ({ page }) => {
		const result = await page.getByTestId('cn-tailwind-conflict-text').getAttribute('data-value');
		expect(result).toContain('text-lg');
		expect(result).toContain('text-red-500');
		expect(result).not.toContain('text-sm');
	});

	test('Tailwind conflict: later background wins', async ({ page }) => {
		const result = await page.getByTestId('cn-tailwind-conflict-bg').getAttribute('data-value');
		expect(result).toContain('bg-green-300');
		expect(result).not.toContain('bg-blue-500');
	});

	test('responsive classes: base overridden, breakpoints preserved', async ({ page }) => {
		const result = await page.getByTestId('cn-responsive-classes').getAttribute('data-value');
		expect(result).toContain('text-base');
		expect(result).toContain('md:text-lg');
		expect(result).toContain('lg:text-xl');
		expect(result).not.toContain(' text-sm');
	});

	test('dark mode variants preserved alongside base', async ({ page }) => {
		const result = await page.getByTestId('cn-dark-mode').getAttribute('data-value');
		expect(result).toContain('dark:bg-gray-900');
		expect(result).toContain('bg-gray-100');
		expect(result).not.toContain('bg-white');
	});

	test('arbitrary values: later wins', async ({ page }) => {
		const result = await page.getByTestId('cn-arbitrary-value').getAttribute('data-value');
		expect(result).toContain('w-[200px]');
		expect(result).not.toContain('w-[100px]');
	});

	test('hover state: later wins', async ({ page }) => {
		const result = await page.getByTestId('cn-hover-state').getAttribute('data-value');
		expect(result).toContain('hover:bg-red-500');
		expect(result).not.toContain('hover:bg-blue-500');
	});

	test('many non-conflicting classes are all preserved', async ({ page }) => {
		const result = await page.getByTestId('cn-many-classes').getAttribute('data-value');
		expect(result).toContain('flex');
		expect(result).toContain('items-center');
		expect(result).toContain('justify-between');
		expect(result).toContain('p-4');
		expect(result).toContain('m-2');
		expect(result).toContain('rounded-lg');
		expect(result).toContain('shadow-md');
		expect(result).toContain('bg-white');
		expect(result).toContain('text-gray-800');
	});

	test('exact duplicate classes are deduplicated', async ({ page }) => {
		const result = await page.getByTestId('cn-duplicate-exact').getAttribute('data-value');
		expect(result).toContain('px-4');
		expect(result).toContain('py-2');
		// Should not have duplicates
		const classes = result!.split(' ');
		const unique = new Set(classes);
		expect(classes.length).toBe(unique.size);
	});
});
