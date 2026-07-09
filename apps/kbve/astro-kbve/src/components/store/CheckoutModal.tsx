import { useEffect, useState } from 'react';
import {
	productDetail,
	buyPhysical,
	StoreApiError,
	type StoreVariant,
	type ShippingAddress,
} from './api';

const WALLET_BROADCAST = 'kbve-wallet-sync';

function notifyWallet() {
	if (typeof BroadcastChannel === 'undefined') return;
	try {
		const ch = new BroadcastChannel(WALLET_BROADCAST);
		ch.postMessage({ type: 'refresh' });
		ch.close();
	} catch {}
}

const EMPTY_ADDR: ShippingAddress = {
	name: '',
	line1: '',
	line2: '',
	city: '',
	region: '',
	postal: '',
	country: '',
};

export function CheckoutModal({
	slug,
	onClose,
	onPurchased,
}: {
	slug: string;
	onClose: () => void;
	onPurchased?: (orderId: number) => void;
}) {
	const [variants, setVariants] = useState<StoreVariant[]>([]);
	const [variantId, setVariantId] = useState('');
	const [qty, setQty] = useState(1);
	const [addr, setAddr] = useState<ShippingAddress>(EMPTY_ADDR);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState<number | null>(null);

	useEffect(() => {
		void productDetail(slug)
			.then((d) => {
				setVariants(d.variants);
				if (d.variants[0]) setVariantId(d.variants[0].variant_id);
			})
			.catch((e) =>
				setError(e instanceof Error ? e.message : 'load failed'),
			);
	}, [slug]);

	const submit = async () => {
		setBusy(true);
		setError(null);
		try {
			const res = await buyPhysical(variantId, {
				qty,
				shipping_address: addr,
				idempotency_key: crypto.randomUUID(),
			});
			notifyWallet();
			setDone(res.order_id);
			onPurchased?.(res.order_id);
		} catch (e) {
			if (e instanceof StoreApiError) {
				if (e.status === 402) setError('Not enough credits.');
				else if (e.code === 'P1020' || e.status === 409)
					setError('Out of stock or duplicate. Try again.');
				else if (e.status === 401) setError('Sign in to buy.');
				else setError(e.message || 'purchase failed');
			} else {
				setError(e instanceof Error ? e.message : 'purchase failed');
			}
		} finally {
			setBusy(false);
		}
	};

	const set = (k: keyof ShippingAddress) => (v: string) =>
		setAddr((a) => ({ ...a, [k]: v }));

	return (
		<div className="kbve-store-modal" role="dialog" aria-modal="true">
			<div className="kbve-store-modal__card">
				<button
					type="button"
					className="kbve-store-modal__close"
					onClick={onClose}
					aria-label="Close">
					×
				</button>
				{done ? (
					<div>
						<h3>Order #{done} placed</h3>
						<p>Paid in credits. Track it in your order history.</p>
						<button type="button" onClick={onClose}>
							Done
						</button>
					</div>
				) : (
					<>
						<h3>Checkout</h3>
						{error && (
							<p className="kbve-store-card__error">{error}</p>
						)}
						<label>
							Variant
							<select
								value={variantId}
								onChange={(e) => setVariantId(e.target.value)}>
								{variants.map((v) => (
									<option
										key={v.variant_id}
										value={v.variant_id}>
										{v.sku} · {v.price} credits ·{' '}
										{v.stock === null
											? 'in stock'
											: `${v.stock} left`}
									</option>
								))}
							</select>
						</label>
						<label>
							Qty
							<input
								type="number"
								min={1}
								value={qty}
								onChange={(e) =>
									setQty(Math.max(1, Number(e.target.value)))
								}
							/>
						</label>
						{(
							[
								['name', 'Full name'],
								['line1', 'Address line 1'],
								['line2', 'Address line 2'],
								['city', 'City'],
								['region', 'State / region'],
								['postal', 'Postal code'],
								['country', 'Country'],
							] as [keyof ShippingAddress, string][]
						).map(([k, label]) => (
							<label key={k}>
								{label}
								<input
									value={addr[k] ?? ''}
									onChange={(e) => set(k)(e.target.value)}
								/>
							</label>
						))}
						<button
							type="button"
							disabled={
								busy ||
								!variantId ||
								!addr.name ||
								!addr.line1 ||
								!addr.city ||
								!addr.country
							}
							onClick={() => void submit()}>
							{busy ? 'Placing…' : 'Buy with credits'}
						</button>
					</>
				)}
			</div>
		</div>
	);
}

export default CheckoutModal;
