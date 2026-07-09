import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@kbve/astro';
import {
	catalog,
	myEntitlements,
	buyProduct,
	StoreApiError,
	type StoreProduct,
} from './api';
import IdiotCard from './IdiotCard';
import './store.css';

const PRODUCT_SLUG = 'i-am-an-idiot';
const WALLET_BROADCAST = 'kbve-wallet-sync';

type Phase = 'loading' | 'ready' | 'buying';

function notifyWalletRefresh() {
	if (typeof BroadcastChannel === 'undefined') return;
	try {
		const ch = new BroadcastChannel(WALLET_BROADCAST);
		ch.postMessage({ type: 'refresh' });
		ch.close();
	} catch {}
}

export function ReactStoreCard() {
	const { ready, authenticated } = useSession();
	const [phase, setPhase] = useState<Phase>('loading');
	const [product, setProduct] = useState<StoreProduct | null>(null);
	const [owned, setOwned] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setPhase('loading');
		setError(null);
		try {
			const products = await catalog();
			const p =
				products.find((x) => x.slug === PRODUCT_SLUG) ?? null;
			setProduct(p);
			if (authenticated) {
				const ents = await myEntitlements();
				setOwned(ents.some((e) => e.slug === PRODUCT_SLUG));
			} else {
				setOwned(false);
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : 'failed to load store');
		} finally {
			setPhase('ready');
		}
	}, [authenticated]);

	useEffect(() => {
		if (!ready) return;
		void load();
	}, [ready, load]);

	const buy = useCallback(async () => {
		if (!product) return;
		setPhase('buying');
		setError(null);
		try {
			await buyProduct(product.slug, {
				idempotency_key: crypto.randomUUID(),
			});
			setOwned(true);
			notifyWalletRefresh();
		} catch (e) {
			if (e instanceof StoreApiError) {
				if (e.status === 402) {
					setError('Not enough credits.');
				} else if (e.status === 409) {
					setOwned(true);
					notifyWalletRefresh();
				} else if (e.status === 401) {
					setError('Sign in to buy this.');
				} else {
					setError(e.message || 'purchase failed');
				}
			} else {
				setError(e instanceof Error ? e.message : 'purchase failed');
			}
		} finally {
			setPhase('ready');
		}
	}, [product]);

	if (!ready || phase === 'loading') {
		return <div className="kbve-store-card kbve-store-card--skeleton" />;
	}

	if (!product) {
		return (
			<div className="kbve-store-card">
				<p className="kbve-store-card__error">
					{error ?? 'Product unavailable.'}
				</p>
			</div>
		);
	}

	const price = `${product.price.toLocaleString()} ${product.currency}`;

	return (
		<div className="kbve-store-card" data-owned={owned ? 'true' : 'false'}>
			<IdiotCard revealed={owned} />

			<div className="kbve-store-card__body">
				<h2 className="kbve-store-card__title">{product.title}</h2>
				<p className="kbve-store-card__desc">
					{owned
						? 'Unlocked. Spin it. You earned this.'
						: (product.description ??
							'Hidden until purchased.')}
				</p>

				{error && (
					<p className="kbve-store-card__error">{error}</p>
				)}

				{owned ? (
					<span className="kbve-store-card__owned-badge">
						Owned
					</span>
				) : authenticated ? (
					<button
						type="button"
						className="kbve-store-card__buy"
						onClick={() => void buy()}
						disabled={phase === 'buying'}>
						{phase === 'buying'
							? 'Purchasing…'
							: `Buy · ${price}`}
					</button>
				) : (
					<a className="kbve-store-card__buy" href="/login/">
						Sign in to buy · {price}
					</a>
				)}
			</div>
		</div>
	);
}

export default ReactStoreCard;
