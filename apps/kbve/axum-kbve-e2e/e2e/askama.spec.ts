import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('Askama SSR profiles', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	describe('GET /@{username}', () => {
		it('returns 404 with HTML for non-existent user', async () => {
			const res = await fetch(`${BASE_URL}/@nonexistentuser12345`);
			expect(res.status).toBe(404);

			const contentType = res.headers.get('content-type') ?? '';
			expect(contentType).toContain('text/html');

			const body = await res.text();
			expect(body).toContain('Profile Not Found');
		});

		it('returns proper HTML document structure', async () => {
			const res = await fetch(`${BASE_URL}/@testuser`);
			const body = await res.text();

			expect(body).toContain('<!DOCTYPE html>');
			expect(body).toContain('<html');
			expect(body).toContain('</html>');
		});

		it('includes the username in the page', async () => {
			const res = await fetch(`${BASE_URL}/@someuser`);
			const body = await res.text();

			// The not-found template should reference the username
			expect(body.toLowerCase()).toContain('someuser');
		});
	});
});
