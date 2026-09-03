import type { Page } from '@playwright/test';

const E2E_USER_ID = '00000000-0000-4000-8000-00000000e2e0';
export const E2E_USERNAME = 'e2e-tester';

const FAR_FUTURE_EPOCH = 4102444800;

function b64url(obj: unknown): string {
	return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function fakeJwt(): string {
	return [
		b64url({ alg: 'HS256', typ: 'JWT' }),
		b64url({
			sub: E2E_USER_ID,
			aud: 'authenticated',
			role: 'authenticated',
			exp: FAR_FUTURE_EPOCH,
			kbve_username: E2E_USERNAME,
		}),
		'e2e-signature',
	].join('.');
}

function fakeSession(): string {
	return JSON.stringify({
		access_token: fakeJwt(),
		refresh_token: 'e2e-refresh',
		token_type: 'bearer',
		expires_in: 3600 * 24 * 365,
		expires_at: FAR_FUTURE_EPOCH,
		user: {
			id: E2E_USER_ID,
			aud: 'authenticated',
			role: 'authenticated',
			email: 'e2e@kbve.com',
			app_metadata: { provider: 'github' },
			user_metadata: {},
			created_at: '2026-01-01T00:00:00Z',
		},
	});
}

/**
 * Seeds a forged Supabase session into the AuthBridge's IndexedDB store
 * before any page script runs. The game gate only base64-decodes the JWT
 * client-side (signature is verified server-side by the game server), so
 * this is enough to mount the HUD without real credentials. The fake
 * token never authenticates against Supabase or the game server.
 */
export async function seedFakeSession(page: Page): Promise<void> {
	await page.addInitScript((sessionJson: string) => {
		const open = indexedDB.open('sb-auth-v2', 10);
		open.onupgradeneeded = () => {
			const db = open.result;
			if (!db.objectStoreNames.contains('kv')) {
				db.createObjectStore('kv', { keyPath: 'key' });
			}
		};
		open.onsuccess = () => {
			const db = open.result;
			const tx = db.transaction('kv', 'readwrite');
			tx.objectStore('kv').put({
				key: 'sb-supabase-auth-token',
				value: sessionJson,
			});
		};
	}, fakeSession());
}
