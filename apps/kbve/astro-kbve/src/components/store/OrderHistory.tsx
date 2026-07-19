import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@kbve/astro';
import { myOrders, type StoreOrder } from './api';
import './store.css';

export function OrderHistory() {
	const { ready, authenticated } = useSession();
	const [orders, setOrders] = useState<StoreOrder[]>([]);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			setOrders(await myOrders());
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'load failed');
		}
	}, []);

	useEffect(() => {
		if (ready && authenticated) void load();
	}, [ready, authenticated, load]);

	if (!ready || !authenticated) return null;
	if (error) return <p className="kbve-store-card__error">{error}</p>;
	if (orders.length === 0) return null;

	return (
		<div className="kbve-store-admin__panel">
			<h3>Your orders</h3>
			<ul className="kbve-store-admin__list">
				{orders.map((o) => (
					<li key={o.order_id}>
						<span>
							#{o.order_id} · {o.qty}× · {o.credits_amount}{' '}
							credits · <strong>{o.status}</strong>
						</span>
						<span>
							{new Date(o.created_at).toLocaleDateString()}
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}

export default OrderHistory;
