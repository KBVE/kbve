import { useCallback, useEffect, useState } from 'react';
import {
	staffListOrders,
	staffAdvanceOrder,
	staffRefundOrder,
	type StoreOrderStaff,
	type OrderStatus,
} from './api';
import './store.css';

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
	paid: 'processing',
	processing: 'shipped',
	shipped: 'delivered',
};

export function StaffOrderQueue() {
	const [orders, setOrders] = useState<StoreOrderStaff[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState<number | null>(null);

	const load = useCallback(async () => {
		try {
			setOrders(await staffListOrders());
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'load failed');
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const advance = useCallback(
		async (o: StoreOrderStaff) => {
			const to = NEXT[o.status];
			if (!to) return;
			setBusy(o.order_id);
			try {
				const tracking =
					to === 'shipped'
						? { number: prompt('Tracking number?') ?? '' }
						: undefined;
				await staffAdvanceOrder(o.order_id, { to_status: to, tracking });
				await load();
			} catch (e) {
				setError(e instanceof Error ? e.message : 'advance failed');
			} finally {
				setBusy(null);
			}
		},
		[load],
	);

	const refund = useCallback(
		async (o: StoreOrderStaff) => {
			if (!confirm(`Refund order #${o.order_id}?`)) return;
			setBusy(o.order_id);
			try {
				await staffRefundOrder(o.order_id, 'staff refund');
				await load();
			} catch (e) {
				setError(e instanceof Error ? e.message : 'refund failed');
			} finally {
				setBusy(null);
			}
		},
		[load],
	);

	return (
		<div className="kbve-store-admin__panel">
			<h3>Order queue</h3>
			{error && <p className="kbve-store-card__error">{error}</p>}
			<ul className="kbve-store-admin__list">
				{orders.map((o) => (
					<li key={o.order_id}>
						<span>
							#{o.order_id} · {o.qty}× · {o.credits_amount} ·{' '}
							<strong>{o.status}</strong>
						</span>
						<span>
							{NEXT[o.status] && (
								<button
									type="button"
									disabled={busy === o.order_id}
									onClick={() => void advance(o)}>
									→ {NEXT[o.status]}
								</button>
							)}
							{o.status !== 'refunded' &&
								o.status !== 'cancelled' && (
									<button
										type="button"
										disabled={busy === o.order_id}
										onClick={() => void refund(o)}>
										Refund
									</button>
								)}
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}

export default StaffOrderQueue;
