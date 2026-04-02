import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('OSRS endpoints', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	describe('GET /api/v1/osrs/:item_id', () => {
		it('returns JSON for a known item ID (rune scimitar = 1333)', async () => {
			const res = await fetch(`${BASE_URL}/api/v1/osrs/1333`);
			// May return 200 (cached) or 502/503 (OSRS API unreachable)
			if (res.status === 200) {
				const data = await res.json();
				expect(data).toHaveProperty('item');
			} else {
				expect([502, 503]).toContain(res.status);
			}
		});

		it('handles invalid item ID gracefully', async () => {
			const res = await fetch(`${BASE_URL}/api/v1/osrs/999999999`);
			// Should return 404 or handle as not found, not 500
			expect(res.status).toBeLessThan(500);
		});

		it('handles non-numeric item ID', async () => {
			const res = await fetch(`${BASE_URL}/api/v1/osrs/not-a-number`);
			// Server should handle this gracefully
			expect(res.status).toBeLessThan(500);
		});
	});

	describe('GET /osrs/:item (HTML page)', () => {
		it('returns HTML for a known item', async () => {
			const res = await fetch(`${BASE_URL}/osrs/rune-scimitar`);
			if (res.status === 200) {
				const ct = res.headers.get('content-type') ?? '';
				expect(ct).toContain('text/html');
			} else {
				// Without OSRS cache, may 404 or 502
				expect([404, 502, 503]).toContain(res.status);
			}
		});

		it('trailing slash variant works the same', async () => {
			const res = await fetch(`${BASE_URL}/osrs/rune-scimitar/`);
			if (res.status === 200) {
				const ct = res.headers.get('content-type') ?? '';
				expect(ct).toContain('text/html');
			} else {
				expect([404, 502, 503]).toContain(res.status);
			}
		});
	});
});
