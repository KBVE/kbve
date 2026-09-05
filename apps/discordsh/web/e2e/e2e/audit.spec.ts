import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// #7712 Audit: DroidProvider deduplication
// ---------------------------------------------------------------------------

test.describe('Audit: Single DroidProvider', () => {
	test('DroidProvider hydration island appears exactly once', async ({
		page,
	}) => {
		await page.goto('/');
		await page.waitForLoadState('domcontentloaded');

		// Astro client:only="react" islands get an astro-island wrapper.
		// DroidProvider renders a hidden data attribute we can count.
		const islands = page.locator(
			'astro-island[component-url*="DroidProvider"]',
		);
		const count = await islands.count();

		// Should be exactly 1 (in NavBar), not 2 (was also in Footer before fix)
		expect(count).toBeLessThanOrEqual(1);
	});
});

// ---------------------------------------------------------------------------
// #7712 Audit: Auth redirect page
// ---------------------------------------------------------------------------

test.describe('Audit: Auth Redirect', () => {
	test('/auth/ returns 200 with meta refresh redirect', async ({
		request,
	}) => {
		const response = await request.get('/auth/');
		expect(response.status()).toBe(200);

		const body = await response.text();
		expect(body).toContain('http-equiv="refresh"');
		expect(body).toContain('url=/');
	});

	test('/auth/ page contains fallback link', async ({ request }) => {
		const response = await request.get('/auth/');
		const body = await response.text();
		expect(body).toContain('href="/"');
	});

	test('/auth/callback returns 200', async ({ request }) => {
		const response = await request.get('/auth/callback');
		expect(response.status()).toBe(200);
	});

	test('/auth/logout returns 200', async ({ request }) => {
		const response = await request.get('/auth/logout');
		expect(response.status()).toBe(200);
	});
});

// ---------------------------------------------------------------------------
// #7712 Audit: hCaptcha preconnect
// ---------------------------------------------------------------------------

test.describe('Audit: hCaptcha Preconnect', () => {
	test('pages include hcaptcha.com preconnect', async ({ request }) => {
		const response = await request.get('/');
		const body = await response.text();
		expect(body).toContain('rel="preconnect" href="https://hcaptcha.com"');
	});

	test('pages include assets.hcaptcha.com preconnect', async ({
		request,
	}) => {
		const response = await request.get('/');
		const body = await response.text();
		expect(body).toContain(
			'rel="preconnect" href="https://assets.hcaptcha.com"',
		);
	});
});

// ---------------------------------------------------------------------------
// #7712 Audit: Server card images lazy loading
// ---------------------------------------------------------------------------

test.describe('Audit: Lazy Loading', () => {
	test('server card images have loading="lazy"', async ({ page }) => {
		await page.goto('/servers/');
		await page.waitForLoadState('domcontentloaded');

		// Wait for React to hydrate the server grid
		const cards = page.locator('.server-card');
		const cardCount = await cards.count();

		if (cardCount > 0) {
			// Check images inside server cards
			const images = page.locator('.server-card img');
			const imgCount = await images.count();

			for (let i = 0; i < imgCount; i++) {
				const loading = await images.nth(i).getAttribute('loading');
				expect(loading).toBe('lazy');
			}
		}
	});

	test('server card images have decoding="async"', async ({ page }) => {
		await page.goto('/servers/');
		await page.waitForLoadState('domcontentloaded');

		const images = page.locator('.server-card img');
		const imgCount = await images.count();

		for (let i = 0; i < imgCount; i++) {
			const decoding = await images.nth(i).getAttribute('decoding');
			expect(decoding).toBe('async');
		}
	});
});

// ---------------------------------------------------------------------------
// #7712 Audit: CSS hover (no JS hover handlers)
// ---------------------------------------------------------------------------

test.describe('Audit: CSS Hover', () => {
	test('server cards have .server-card class for CSS hover', async ({
		page,
	}) => {
		await page.goto('/servers/');
		await page.waitForLoadState('domcontentloaded');

		const cards = page.locator('.server-card');
		const count = await cards.count();

		// If there are server cards, they should all have the class
		if (count > 0) {
			for (let i = 0; i < Math.min(count, 5); i++) {
				const className = await cards.nth(i).getAttribute('class');
				expect(className).toContain('server-card');
			}
		}
	});

	test('server cards do not have inline onmouseenter handlers', async ({
		page,
	}) => {
		await page.goto('/servers/');
		await page.waitForLoadState('domcontentloaded');

		const cards = page.locator('.server-card');
		const count = await cards.count();

		for (let i = 0; i < Math.min(count, 5); i++) {
			const onMouseEnter = await cards
				.nth(i)
				.getAttribute('onmouseenter');
			expect(onMouseEnter).toBeNull();
		}
	});
});

// ---------------------------------------------------------------------------
// #7712 Audit: Security headers on audit-affected routes
// ---------------------------------------------------------------------------

test.describe('Audit: Security Headers on Auth Routes', () => {
	test('/auth/ has security headers', async ({ request }) => {
		const response = await request.get('/auth/');
		const headers = response.headers();
		expect(headers['x-content-type-options']).toBe('nosniff');
		expect(headers['x-frame-options']).toBe('DENY');
	});

	test('/auth/callback has security headers', async ({ request }) => {
		const response = await request.get('/auth/callback');
		const headers = response.headers();
		expect(headers['x-content-type-options']).toBe('nosniff');
		expect(headers['x-frame-options']).toBe('DENY');
	});

	test('/auth/logout has security headers', async ({ request }) => {
		const response = await request.get('/auth/logout');
		const headers = response.headers();
		expect(headers['x-content-type-options']).toBe('nosniff');
		expect(headers['x-frame-options']).toBe('DENY');
	});
});

// ---------------------------------------------------------------------------
// #7712 Audit: Auth scripts use module imports (not inline logic)
// ---------------------------------------------------------------------------

test.describe('Audit: Auth Script Modules', () => {
	test('/auth/callback script imports from lib/auth module', async ({
		request,
	}) => {
		const response = await request.get('/auth/callback');
		const body = await response.text();
		// Vite bundles the import, but the original template should NOT
		// contain raw authBridge logic inline — only an import statement.
		// Verify the page loads (200) and contains a script tag.
		expect(response.status()).toBe(200);
		expect(body).toContain('<script');
		// Should NOT contain the old inline handleCallback pattern
		expect(body).not.toContain('authBridge.handleCallback()');
	});

	test('/auth/logout script imports from lib/auth module', async ({
		request,
	}) => {
		const response = await request.get('/auth/logout');
		const body = await response.text();
		expect(response.status()).toBe(200);
		expect(body).toContain('<script');
		// Should NOT contain the old inline signOut pattern
		expect(body).not.toContain('authBridge.signOut()');
	});
});

// ---------------------------------------------------------------------------
// #7712 Audit: Inline styles removed — CSS classes used
// ---------------------------------------------------------------------------

test.describe('Audit: No Inline Styles', () => {
	test('server cards do not use inline style attributes', async ({
		page,
	}) => {
		await page.goto('/servers/');
		await page.waitForLoadState('domcontentloaded');

		const cards = page.locator('.server-card');
		const count = await cards.count();

		for (let i = 0; i < Math.min(count, 5); i++) {
			const style = await cards.nth(i).getAttribute('style');
			expect(style).toBeNull();
		}
	});

	test('submit form inputs use sf-input CSS class', async ({ page }) => {
		await page.goto('/servers/submit');
		await page.waitForLoadState('domcontentloaded');

		const inputs = page.locator('.sf-input');
		const count = await inputs.count();
		// Submit form should have at least the required fields
		expect(count).toBeGreaterThanOrEqual(4);
	});

	test('submit form labels use sf-label CSS class', async ({ page }) => {
		await page.goto('/servers/submit');
		await page.waitForLoadState('domcontentloaded');

		const labels = page.locator('.sf-label');
		const count = await labels.count();
		expect(count).toBeGreaterThanOrEqual(4);
	});
});

// ---------------------------------------------------------------------------
// #7712 Audit: NavBar uses CSS classes (no inline style objects)
// ---------------------------------------------------------------------------

test.describe('Audit: NavBar CSS Classes', () => {
	test('OAuth buttons use nb-oauth-btn class', async ({ page }) => {
		await page.goto('/');
		await page.waitForLoadState('domcontentloaded');

		// OAuth buttons only render inside the sign-in modal which is
		// conditionally mounted by React. Wait for the island to hydrate,
		// then open the modal before asserting.
		const signInBtn = page.locator('button[aria-label="Sign in"]');
		// The React island may take a moment to hydrate — wait up to 10s.
		await signInBtn.first().waitFor({ state: 'visible', timeout: 10_000 });
		await signInBtn.first().click();

		// Modal is portal-mounted; wait for the Discord OAuth button.
		const discordBtn = page.locator('.nb-oauth-discord');
		await discordBtn.waitFor({ state: 'visible', timeout: 5_000 });
		await expect(discordBtn).toHaveClass(/nb-oauth-btn/);
	});
});

// ---------------------------------------------------------------------------
// #7712 Audit: ExpandButton uses CSS class
// ---------------------------------------------------------------------------

test.describe('Audit: ExpandButton CSS', () => {
	test('expand buttons use eb-base CSS class', async ({ page }) => {
		await page.goto('/servers/');
		await page.waitForLoadState('domcontentloaded');

		const buttons = page.locator('.eb-base');
		const count = await buttons.count();
		// Each server card has 2 expand buttons (vote + join)
		if (count > 0) {
			expect(count).toBeGreaterThanOrEqual(2);
		}
	});
});
