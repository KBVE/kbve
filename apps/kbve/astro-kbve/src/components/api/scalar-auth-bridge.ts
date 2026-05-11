import { initSupa, getSupa } from '@/lib/supa';

type ScalarInstance = {
	updateConfiguration: (cfg: Record<string, unknown>) => void;
};

declare global {
	interface Window {
		__scalarRef?: ScalarInstance;
		__scalarBaseConfig?: Record<string, unknown>;
	}
}

const BEARER_SCHEME = 'bearerAuth';

function waitForInstance(timeoutMs = 10_000): Promise<ScalarInstance | null> {
	return new Promise((resolve) => {
		if (window.__scalarRef) {
			resolve(window.__scalarRef);
			return;
		}
		const start = performance.now();
		const id = window.setInterval(() => {
			if (window.__scalarRef) {
				window.clearInterval(id);
				resolve(window.__scalarRef);
			} else if (performance.now() - start > timeoutMs) {
				window.clearInterval(id);
				resolve(null);
			}
		}, 50);
	});
}

function withAuth(
	base: Record<string, unknown>,
	token: string | null | undefined,
): Record<string, unknown> {
	if (!token) return base;
	return {
		...base,
		authentication: {
			preferredSecurityScheme: BEARER_SCHEME,
			securitySchemes: {
				[BEARER_SCHEME]: { token },
			},
		},
	};
}

void (async () => {
	const instance = await waitForInstance();
	if (!instance) return;
	const baseConfig = window.__scalarBaseConfig ?? {};

	try {
		await initSupa();
		const supa = getSupa();
		const result = await supa.getSession().catch(() => null);
		const token = result?.session?.access_token as string | undefined;
		if (token) instance.updateConfiguration(withAuth(baseConfig, token));
		supa.on('auth', (payload: unknown) => {
			const msg = payload as
				| { session?: { access_token?: string } }
				| undefined;
			instance.updateConfiguration(
				withAuth(baseConfig, msg?.session?.access_token ?? null),
			);
		});
	} catch (e) {
		console.warn('Scalar auth bridge skipped:', e);
	}
})();
