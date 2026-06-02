import { test as base, type Page } from '@playwright/test';

const SB_AUTH_TOKEN_KEY = 'sb-auth-token';

export interface MockSession {
	access_token: string;
	refresh_token: string;
	token_type: 'bearer';
	expires_in: number;
	expires_at: number;
	user: {
		id: string;
		email: string;
		role: 'authenticated';
		aud: 'authenticated';
		user_metadata: Record<string, unknown>;
		app_metadata: Record<string, unknown>;
	};
}

export interface MockSessionOverrides {
	userId?: string;
	email?: string;
	accessToken?: string;
	expiresInSeconds?: number;
	userMetadata?: Record<string, unknown>;
	appMetadata?: Record<string, unknown>;
	staff?: boolean;
	profileUsername?: string;
}

export function buildMockSession(
	overrides: MockSessionOverrides = {},
): MockSession {
	const expiresInSeconds = overrides.expiresInSeconds ?? 3600;
	const now = Math.floor(Date.now() / 1000);
	return {
		access_token: overrides.accessToken ?? 'mock-access-token',
		refresh_token: 'mock-refresh-token',
		token_type: 'bearer',
		expires_in: expiresInSeconds,
		expires_at: now + expiresInSeconds,
		user: {
			id: overrides.userId ?? '00000000-0000-0000-0000-000000000001',
			email: overrides.email ?? 'mock@kbve.com',
			role: 'authenticated',
			aud: 'authenticated',
			user_metadata: overrides.userMetadata ?? {},
			app_metadata: overrides.appMetadata ?? {},
		},
	};
}

export async function mockSupaSession(
	page: Page,
	overrides: MockSessionOverrides = {},
): Promise<MockSession> {
	const session = buildMockSession(overrides);
	const payload = JSON.stringify({
		currentSession: session,
		expiresAt: session.expires_at,
	});
	const staff = overrides.staff === true;
	const profileUsername = overrides.profileUsername ?? 'mockuser';
	const userId = session.user.id;

	await page.addInitScript(
		({ key, value, userId, profileUsername, staff }) => {
			try {
				localStorage.setItem(key, value);
				localStorage.setItem(
					'cache:profile:me',
					JSON.stringify({
						user_id: userId,
						profile: { username: profileUsername },
					}),
				);
				if (staff) {
					localStorage.setItem(
						'cache:staff:perms',
						JSON.stringify({ user_id: userId, bitmask: 1 }),
					);
				}
			} catch {
				/* ignore */
			}
		},
		{
			key: SB_AUTH_TOKEN_KEY,
			value: payload,
			userId,
			profileUsername,
			staff,
		},
	);

	return session;
}

export async function clearSupaSession(page: Page): Promise<void> {
	await page.addInitScript(() => {
		try {
			localStorage.removeItem('sb-auth-token');
			localStorage.removeItem('cache:profile:me');
			localStorage.removeItem('cache:staff:perms');
		} catch {
			/* ignore */
		}
	});
}

export interface MockArgoApplication {
	name: string;
	project?: string;
	namespace?: string;
	syncStatus?: 'Synced' | 'OutOfSync' | 'Unknown';
	healthStatus?:
		| 'Healthy'
		| 'Degraded'
		| 'Progressing'
		| 'Suspended'
		| 'Missing'
		| 'Unknown';
}

export async function mockArgoApi(
	page: Page,
	apps: MockArgoApplication[] = [],
): Promise<void> {
	const items = apps.map((a) => ({
		metadata: {
			name: a.name,
			namespace: a.namespace ?? 'argocd',
			creationTimestamp: new Date().toISOString(),
		},
		spec: {
			project: a.project ?? 'default',
			source: {
				repoURL: 'https://github.com/example/example.git',
				path: 'manifests',
				targetRevision: 'HEAD',
			},
			destination: {
				server: 'https://kubernetes.default.svc',
				namespace: 'default',
			},
		},
		status: {
			sync: { status: a.syncStatus ?? 'Synced' },
			health: { status: a.healthStatus ?? 'Healthy' },
			reconciledAt: new Date().toISOString(),
		},
	}));

	await page.route(
		'**/dashboard/argo/proxy/api/v1/applications**',
		async (route) => {
			const url = new URL(route.request().url());
			if (
				/\/resource-tree$/.test(url.pathname) ||
				/\/events$/.test(url.pathname)
			) {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ nodes: [], items: [] }),
				});
				return;
			}
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ items }),
			});
		},
	);
}

export const test = base.extend<{
	authedPage: Page;
}>({
	authedPage: async ({ page }, use) => {
		await mockSupaSession(page);
		await use(page);
	},
});

export { expect } from '@playwright/test';
