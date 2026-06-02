import {
	test,
	expect,
	mockSupaSession,
	clearSupaSession,
} from './fixtures/auth-mock';

test.describe('auth-mock harness smoke', () => {
	test('mockSupaSession seeds sb-auth-token before app load', async ({
		page,
	}) => {
		await mockSupaSession(page, { userId: 'aaaa', email: 'aaaa@kbve.com' });
		await page.goto('/');
		const stored = await page.evaluate(() =>
			localStorage.getItem('sb-auth-token'),
		);
		expect(stored).not.toBeNull();
		const parsed = JSON.parse(stored as string);
		expect(parsed?.currentSession?.user?.id).toBe('aaaa');
		expect(parsed?.currentSession?.user?.email).toBe('aaaa@kbve.com');
	});

	test('clearSupaSession removes seeded keys', async ({ page }) => {
		await mockSupaSession(page);
		await clearSupaSession(page);
		await page.goto('/');
		const stored = await page.evaluate(() =>
			localStorage.getItem('sb-auth-token'),
		);
		expect(stored).toBeNull();
	});
});
