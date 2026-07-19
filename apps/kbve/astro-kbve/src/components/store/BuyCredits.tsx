import { useState } from 'react';
import { useSession } from '@kbve/astro';
import { topupCheckout, CREDIT_PACKS, StoreApiError } from './api';
import './store.css';

export function BuyCredits() {
	const { ready, authenticated } = useSession();
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	if (!ready) return null;

	const buy = async (packId: string) => {
		setBusy(packId);
		setError(null);
		try {
			const { checkout_url } = await topupCheckout(packId);
			window.location.href = checkout_url;
		} catch (e) {
			if (e instanceof StoreApiError && e.status === 503) {
				setError('Credit top-up is not available yet.');
			} else if (e instanceof StoreApiError && e.status === 401) {
				setError('Sign in to buy credits.');
			} else {
				setError(e instanceof Error ? e.message : 'checkout failed');
			}
			setBusy(null);
		}
	};

	return (
		<div className="kbve-store-admin__panel">
			<h3>Buy credits</h3>
			<p className="kbve-store-tile__desc">
				Top up with Stripe. Credits buy anything in the store.
			</p>
			{error && <p className="kbve-store-card__error">{error}</p>}
			<div className="kbve-store-admin__form">
				{CREDIT_PACKS.map((p) => (
					<button
						key={p.pack_id}
						type="button"
						disabled={!authenticated || busy !== null}
						onClick={() => void buy(p.pack_id)}>
						{busy === p.pack_id ? 'Redirecting…' : p.label}
					</button>
				))}
			</div>
			{!authenticated && (
				<p className="kbve-store-tile__desc">Sign in to buy credits.</p>
			)}
		</div>
	);
}

export default BuyCredits;
