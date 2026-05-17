import { useState } from 'react';
import { useSession } from '@kbve/astro';
import { createListing, MarketApiError } from './api';
import { EnchantEditor } from './EnchantEditor';
import type { Enchant } from './enchants';
import { MCItemPicker } from './MCItemPicker';

const KIND_OPTIONS = [
	{ value: 'mc_item', label: 'Minecraft item' },
	{ value: 'rareicon_item', label: 'Rareicon item' },
	{ value: 'generic', label: 'Other' },
];

function defaultExpiry(): string {
	const d = new Date(Date.now() + 1000 * 60 * 60 * 24);
	d.setSeconds(0, 0);
	return d.toISOString().slice(0, 16);
}

export function MarketCreateForm() {
	const { ready, authenticated } = useSession();
	const [kind, setKind] = useState('mc_item');
	const [itemId, setItemId] = useState('');
	const [instanceId, setInstanceId] = useState('');
	const [buyNow, setBuyNow] = useState('');
	const [minBid, setMinBid] = useState('');
	const [expires, setExpires] = useState(defaultExpiry());
	const [enchants, setEnchants] = useState<Enchant[]>([]);
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
		if (!itemId.trim()) {
			setError('item id is required');
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
		const expiryIso = new Date(expires).toISOString();
		const item_ref: Record<string, unknown> = { kind, id: itemId.trim() };
		if (instanceId.trim()) item_ref.instance_id = instanceId.trim();
		if (kind === 'mc_item' && enchants.length > 0) {
			item_ref.enchants = enchants.map((e) => ({
				id: e.id,
				level: e.level,
			}));
		}
		setBusy(true);
		try {
			const res = await createListing({
				item_ref,
				buy_now_price: bn !== null ? Math.floor(bn) : null,
				min_bid: mb !== null ? Math.floor(mb) : null,
				expires_at: expiryIso,
				idempotency_key: crypto.randomUUID(),
			});
			setSuccess(res.id);
			setItemId('');
			setInstanceId('');
			setBuyNow('');
			setMinBid('');
			setEnchants([]);
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
				<label>
					Kind
					<select
						value={kind}
						onChange={(e) => setKind(e.target.value)}
						className="kbve-market__input">
						{KIND_OPTIONS.map((k) => (
							<option key={k.value} value={k.value}>
								{k.label}
							</option>
						))}
					</select>
				</label>
				<label>
					Item ID
					{kind === 'mc_item' ? (
						<MCItemPicker
							value={itemId}
							onChange={setItemId}
							disabled={busy}
						/>
					) : (
						<input
							type="text"
							required
							placeholder="diamond_sword"
							value={itemId}
							onChange={(e) => setItemId(e.target.value)}
							className="kbve-market__input"
						/>
					)}
				</label>
				<label>
					Instance ID (optional)
					<input
						type="text"
						placeholder="uuid for unique instances"
						value={instanceId}
						onChange={(e) => setInstanceId(e.target.value)}
						className="kbve-market__input"
					/>
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
				<label>
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
			{kind === 'mc_item' && (
				<EnchantEditor
					value={enchants}
					onChange={setEnchants}
					disabled={busy}
				/>
			)}
			<div className="kbve-market__form-actions">
				<button
					type="submit"
					className="kbve-market__btn kbve-market__btn--primary"
					disabled={busy}>
					{busy ? 'Listing…' : 'Create Listing'}
				</button>
				<span className="kbve-market__hint">
					1% KBVE Treasury fee applies on sale.
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
