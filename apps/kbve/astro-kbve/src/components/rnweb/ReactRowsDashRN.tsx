import { useEffect, useMemo, useState } from 'react';
import { StreamView, createRowsStream, rowsLens } from '@kbve/rn/dash';
import { initSupa, getSupa } from '@/lib/supa';
import { DASH_PROXY_BASE } from './dashProxyBase';

async function getToken(): Promise<string | null> {
	try {
		await initSupa();
		const result = await getSupa()
			.getSession()
			.catch(() => null);
		return result?.session?.access_token ?? null;
	} catch {
		return null;
	}
}

type TenantState =
	| { phase: 'loading' }
	| { phase: 'error'; message: string }
	| { phase: 'ready'; tenantId: string };

export default function ReactRowsDashRN() {
	const [state, setState] = useState<TenantState>({ phase: 'loading' });

	useEffect(() => {
		let alive = true;
		(async () => {
			try {
				const token = await getToken();
				const res = await fetch(
					`${DASH_PROXY_BASE}/dashboard/chuckrpg/tenants`,
					{
						headers: token
							? { Authorization: `Bearer ${token}` }
							: {},
					},
				);
				if (!res.ok) {
					if (alive)
						setState({
							phase: 'error',
							message: `tenant lookup failed (${res.status})`,
						});
					return;
				}
				const data = (await res.json()) as {
					tenants?: { id: string; default?: boolean }[];
				};
				const tenants = data.tenants ?? [];
				const pick =
					tenants.find((t) => t.default)?.id ??
					tenants[0]?.id ??
					null;
				if (!alive) return;
				setState(
					pick
						? { phase: 'ready', tenantId: pick }
						: {
								phase: 'error',
								message: 'no ROWS tenants available',
							},
				);
			} catch (e) {
				if (alive)
					setState({
						phase: 'error',
						message:
							e instanceof Error ? e.message : 'tenant error',
					});
			}
		})();
		return () => {
			alive = false;
		};
	}, []);

	const tenantId = state.phase === 'ready' ? state.tenantId : null;
	const store = useMemo(
		() =>
			tenantId
				? createRowsStream({
						getToken,
						baseUrl: DASH_PROXY_BASE,
						tenantId,
					})
				: null,
		[tenantId],
	);

	if (state.phase === 'loading') {
		return <div style={{ padding: '1rem', opacity: 0.6 }}>Loading…</div>;
	}
	if (state.phase === 'error' || !store) {
		const message =
			state.phase === 'error' ? state.message : 'no ROWS tenant';
		return (
			<div style={{ padding: '1rem', color: 'var(--sl-color-gray-3)' }}>
				ROWS unavailable — {message}
			</div>
		);
	}

	return (
		<StreamView
			store={store}
			lens={rowsLens}
			layout="rows"
			searchPlaceholder="filter by server / instance"
		/>
	);
}
