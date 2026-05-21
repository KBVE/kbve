import { useState } from 'react';
import { useSession } from '@kbve/astro';
import { createListing, MarketApiError } from './api';

function defaultExpiry(): string {
	const d = new Date(Date.now() + 1000 * 60 * 60 * 24);
	d.setSeconds(0, 0);
	return d.toISOString().slice(0, 16);
}

const UUID_RE =
	/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function MarketCreateForm() {
	const { ready, authenticated } = useSession();
	const [srcItemId, setSrcItemId] = useState('');
	const [qty, setQty] = useState('');
	const [buyNow, setBuyNow] = useState('');
	const [minBid, setMinBid] = useState('');
	const [expires, setExpires] = useState(defaultExpiry());
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<number | null>(null);

	if (!ready) return null;
	if (!authenticated) {
		return (
			<div className="kbve-market__status">
				Sign in to list an item for sale.
			</div>
		);
	}

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setSuccess(null);
		const id = srcItemId.trim();
		if (!UUID_RE.test(id)) {
			setError('inventory item id must be a UUID');
			return;
		}
		const bn = buyNow.trim() ? Number(buyNow) : null;
		const mb = minBid.trim() ? Number(minBid) : null;
		if (bn === null && mb === null) {
			setError('set a buy-now price or a min bid');
			return;
		}
		if (bn !== null && (!Number.isFinite(bn) || bn <= 0)) {
			setError('buy-now must be a positive integer');
			return;
		}
		if (mb !== null && (!Number.isFinite(mb) || mb <= 0)) {
			setError('min bid must be a positive integer');
			return;
		}
		let qtyParsed: number | null = null;
		if (qty.trim()) {
			const n = Number(qty);
			if (!Number.isFinite(n) || n <= 0 || n !== Math.floor(n)) {
				setError('qty must be a positive integer');
				return;
			}
			qtyParsed = n;
		}
		const expiryIso = new Date(expires).toISOString();
		setBusy(true);
		try {
			const res = await createListing({
				src_item_id: id,
				qty: qtyParsed,
				buy_now_price: bn !== null ? Math.floor(bn) : null,
				min_bid: mb !== null ? Math.floor(mb) : null,
				expires_at: expiryIso,
				idempotency_key: crypto.randomUUID(),
			});
			setSuccess(res.id);
			setSrcItemId('');
			setQty('');
			setBuyNow('');
			setMinBid('');
		} catch (err) {
			setError(
				err instanceof MarketApiError ? err.message : 'create failed',
			);
		} finally {
			setBusy(false);
		}
	};

	return (
		<form className="kbve-market__form" onSubmit={onSubmit}>
			<div className="kbve-market__form-row">
				<label className="kbve-market__form-label--wide">
					Inventory Item ID
					<input
						type="text"
						required
						placeholder="uuid from your KBVE inventory"
						value={srcItemId}
						onChange={(e) => setSrcItemId(e.target.value)}
						className="kbve-market__input"
						spellCheck={false}
						autoComplete="off"
					/>
					<span className="kbve-market__hint">
						UUID of the item row in your KBVE inventory. The item
						must be in <code>held</code> state and owned by you.
						Item picker comes in Phase 6.2 — for now, copy the id
						from <code>/profile/inventory/</code>.
					</span>
				</label>
			</div>
			<div className="kbve-market__form-row">
				<label>
					Qty (optional)
					<input
						type="number"
						min={1}
						step={1}
						placeholder="leave blank for whole row"
						value={qty}
						onChange={(e) => setQty(e.target.value)}
						className="kbve-market__input"
					/>
					<span className="kbve-market__hint">
						Partial-stack listing. Blank = list the whole row. Only
						allowed for stackable items.
					</span>
				</label>
			</div>
			<div className="kbve-market__form-row">
				<label>
					Buy Now (KHash)
					<input
						type="number"
						min={1}
						step={1}
						value={buyNow}
						onChange={(e) => setBuyNow(e.target.value)}
						className="kbve-market__input"
					/>
				</label>
				<label>
					Min Bid (KHash)
					<input
						type="number"
						min={1}
						step={1}
						value={minBid}
						onChange={(e) => setMinBid(e.target.value)}
						className="kbve-market__input"
					/>
				</label>
			</div>
			<div className="kbve-market__form-row">
				<label className="kbve-market__form-label--wide">
					Expires At
					<input
						type="datetime-local"
						required
						value={expires}
						onChange={(e) => setExpires(e.target.value)}
						className="kbve-market__input"
					/>
				</label>
			</div>
			<div className="kbve-market__form-actions">
				<button
					type="submit"
					className="kbve-market__btn kbve-market__btn--primary"
					disabled={busy}>
					{busy ? 'Listing…' : 'Create Listing'}
				</button>
				<span className="kbve-market__hint">
					1% KBVE Treasury fee applies on sale. Listing duration
					capped at 30 days. 2FA may be required if you opted into the
					high-value listing gate.
				</span>
			</div>
			{error && (
				<div className="kbve-market__status kbve-market__status--error">
					{error}
				</div>
			)}
			{success !== null && (
				<div className="kbve-market__status kbve-market__status--ok">
					Listing #{success} created.{' '}
					<a href={`/market/listing/?id=${success}`}>
						View listing →
					</a>
				</div>
			)}
		</form>
	);
}

export default MarketCreateForm;
