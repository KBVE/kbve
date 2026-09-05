/**
 * Mock API E2E tests — validates that the discordsh service comes up and
 * serves its pages with the GitHub API redirected to a Mockoon backend.
 *
 * These tests run against the full docker-compose stack:
 *   - mockoon-github   (port 4010)
 *   - discordsh        (port 4321, GITHUB_API_BASE_URL → mockoon-github)
 *
 * The tests verify stability of the integration path without requiring
 * any real credentials.
 */
import { test, expect } from '@playwright/test';

const GITHUB_MOCK = 'http://localhost:4010';

// ── Bot health (confirms the full stack is up) ──────────────────────

test.describe('Mock Stack: Bot Health', () => {
	test('GET /health returns ok', async ({ request }) => {
		const resp = await request.get('/health');
		expect(resp.status()).toBe(200);
		const json = await resp.json();
		expect(json.status).toBe('ok');
	});

	test('GET /healthz returns plain text ok', async ({ request }) => {
		const resp = await request.get('/healthz');
		expect(resp.status()).toBe(200);
		expect(await resp.text()).toBe('ok');
	});
});

// ── Mockoon GitHub mock is live ─────────────────────────────────────

test.describe('Mock Stack: GitHub Mock', () => {
	test('issues endpoint returns canned data', async () => {
		const resp = await fetch(`${GITHUB_MOCK}/repos/KBVE/kbve/issues`);
		expect(resp.status).toBe(200);

		const issues = await resp.json();
		expect(Array.isArray(issues)).toBe(true);
		expect(issues.length).toBeGreaterThan(0);

		// Verify structure matches what GitHubClient expects
		const issue = issues[0];
		expect(issue).toHaveProperty('number');
		expect(issue).toHaveProperty('title');
		expect(issue).toHaveProperty('state');
		expect(issue).toHaveProperty('user');
		expect(issue.user).toHaveProperty('login');
		expect(issue).toHaveProperty('labels');
		expect(issue).toHaveProperty('html_url');
	});

	test('pulls endpoint returns canned data', async () => {
		const resp = await fetch(`${GITHUB_MOCK}/repos/KBVE/kbve/pulls`);
		expect(resp.status).toBe(200);

		const pulls = await resp.json();
		expect(Array.isArray(pulls)).toBe(true);
		expect(pulls.length).toBeGreaterThan(0);

		const pr = pulls[0];
		expect(pr).toHaveProperty('number');
		expect(pr).toHaveProperty('head');
		expect(pr.head).toHaveProperty('ref');
		expect(pr.head).toHaveProperty('sha');
		expect(pr).toHaveProperty('draft');
	});

	test('repo metadata endpoint returns canned data', async () => {
		const resp = await fetch(`${GITHUB_MOCK}/repos/KBVE/kbve`);
		expect(resp.status).toBe(200);

		const repo = await resp.json();
		expect(repo.full_name).toBe('KBVE/kbve');
		expect(repo.default_branch).toBe('main');
		expect(repo).toHaveProperty('open_issues_count');
	});

	test('rate limit headers are present', async () => {
		const resp = await fetch(`${GITHUB_MOCK}/repos/KBVE/kbve/issues`);
		expect(resp.headers.get('x-ratelimit-limit')).toBe('5000');
		expect(resp.headers.get('x-ratelimit-remaining')).toBeTruthy();
		expect(resp.headers.get('x-ratelimit-reset')).toBeTruthy();
	});
});

// ── Error scenarios ─────────────────────────────────────────────────

test.describe('Mock Stack: GitHub Error Routes', () => {
	test('unauthorized owner returns 401', async () => {
		const resp = await fetch(
			`${GITHUB_MOCK}/repos/unauthorized/test/issues`,
		);
		expect(resp.status).toBe(401);
		const body = await resp.json();
		expect(body.message).toBe('Bad credentials');
	});

	test('forbidden owner returns 403', async () => {
		const resp = await fetch(`${GITHUB_MOCK}/repos/forbidden/test/issues`);
		expect(resp.status).toBe(403);
		const body = await resp.json();
		expect(body.message).toContain('rate limit');
	});

	test('notfound owner returns 404', async () => {
		const resp = await fetch(`${GITHUB_MOCK}/repos/notfound/test/issues`);
		expect(resp.status).toBe(404);
		const body = await resp.json();
		expect(body.message).toBe('Not Found');
	});
});

// ── Bot serves frontend through mock stack ──────────────────────────

test.describe('Mock Stack: Bot Frontend', () => {
	test('main page loads through mock stack', async ({ page }) => {
		const response = await page.goto('/');
		expect(response).not.toBeNull();
		expect(response!.status()).toBe(200);
		await expect(page.locator('html')).toBeVisible();
	});

	test('security headers present', async ({ request }) => {
		const resp = await request.get('/health');
		const h = resp.headers();
		expect(h['x-content-type-options']).toBe('nosniff');
		expect(h['x-frame-options']).toBe('DENY');
	});
});
