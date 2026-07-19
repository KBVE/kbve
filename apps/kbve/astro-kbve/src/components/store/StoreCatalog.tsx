import { useCallback, useEffect, useState } from 'react';
import { catalog, type StoreProduct } from './api';
import CheckoutModal from './CheckoutModal';
import './store.css';

export function StoreCatalog() {
	const [products, setProducts] = useState<StoreProduct[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [checkoutSlug, setCheckoutSlug] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			setProducts(await catalog());
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'load failed');
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	if (error) return <p className="kbve-store-card__error">{error}</p>;

	return (
		<div className="kbve-store__grid">
			{products.map((p) => (
				<div key={p.product_id} className="kbve-store-tile">
					<div className="kbve-store-tile__head">
						<strong>{p.title}</strong>
						<span className="kbve-store-tile__tag">
							{p.fulfillment}
						</span>
					</div>
					<p className="kbve-store-tile__desc">
						{p.description ?? ''}
					</p>
					<div className="kbve-store-tile__foot">
						<span>
							{p.price} {p.currency}
						</span>
						{p.fulfillment === 'digital' ? (
							<a
								className="kbve-store-card__buy"
								href={`/store/`}>
								View
							</a>
						) : (
							<button
								type="button"
								className="kbve-store-card__buy"
								onClick={() => setCheckoutSlug(p.slug)}>
								Buy
							</button>
						)}
					</div>
				</div>
			))}
			{checkoutSlug && (
				<CheckoutModal
					slug={checkoutSlug}
					onClose={() => setCheckoutSlug(null)}
				/>
			)}
		</div>
	);
}

export default StoreCatalog;
