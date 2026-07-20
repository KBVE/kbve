import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Button } from '../../ui/primitives/Button';
import { FormField } from '../../ui/primitives/FormField';
import { Stack } from '../../ui/primitives/Stack';
import { Text } from '../../ui/primitives/Text';
import { tokens } from '../../ui/theme';
import { Select } from '../../ui/controls/Select';
import type { SelectOption } from '../../ui/controls/Select.types';
import type { MarketApi } from './api';
import { MarketApiError } from './errors';

const UUID_RE =
	/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const DURATION_MS: Record<string, number> = {
	'24h': 1000 * 60 * 60 * 24,
	'3d': 1000 * 60 * 60 * 24 * 3,
	'7d': 1000 * 60 * 60 * 24 * 7,
	'14d': 1000 * 60 * 60 * 24 * 14,
	'30d': 1000 * 60 * 60 * 24 * 30,
};

const DURATION_OPTIONS: SelectOption[] = [
	{ value: '24h', label: '24 hours' },
	{ value: '3d', label: '3 days' },
	{ value: '7d', label: '7 days' },
	{ value: '14d', label: '14 days' },
	{ value: '30d', label: '30 days' },
];

export interface MarketCreateFormProps {
	api: MarketApi;
	authenticated: boolean;
	onCreated?: (id: number) => void;
}

export function MarketCreateForm({
	api,
	authenticated,
	onCreated,
}: MarketCreateFormProps) {
	const [srcItemId, setSrcItemId] = useState('');
	const [qty, setQty] = useState('');
	const [buyNow, setBuyNow] = useState('');
	const [minBid, setMinBid] = useState('');
	const [duration, setDuration] = useState('24h');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<number | null>(null);

	if (!authenticated) {
		return <Text tone="muted">Sign in to list an item for sale.</Text>;
	}

	const onSubmit = async () => {
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
		const durationMs = DURATION_MS[duration] ?? DURATION_MS['24h'];
		const expiresAt = new Date(Date.now() + durationMs).toISOString();
		setBusy(true);
		try {
			const res = await api.createListing({
				src_item_id: id,
				qty: qtyParsed,
				buy_now_price: bn !== null ? Math.floor(bn) : null,
				min_bid: mb !== null ? Math.floor(mb) : null,
				expires_at: expiresAt,
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
		<Stack gap="lg">
			<FormField
				label="Inventory Item ID"
				placeholder="uuid from your KBVE inventory"
				value={srcItemId}
				onChangeText={setSrcItemId}
				autoCapitalize="none"
				autoCorrect={false}
				hint="UUID of the item row in your KBVE inventory. The item must be in held state and owned by you."
			/>
			<FormField
				label="Qty (optional)"
				placeholder="leave blank for whole row"
				value={qty}
				onChangeText={setQty}
				keyboardType="number-pad"
				hint="Partial-stack listing. Blank = list the whole row."
			/>
			<Stack direction="row" gap="md" wrap>
				<FormField
					label="Buy Now (KHash)"
					value={buyNow}
					onChangeText={setBuyNow}
					keyboardType="number-pad"
					style={styles.half}
				/>
				<FormField
					label="Min Bid (KHash)"
					value={minBid}
					onChangeText={setMinBid}
					keyboardType="number-pad"
					style={styles.half}
				/>
			</Stack>
			<Stack gap="xs">
				<Text variant="label" tone="muted">
					Expires In
				</Text>
				<Select
					value={duration}
					options={DURATION_OPTIONS}
					onValueChange={setDuration}
				/>
			</Stack>
			<Button
				title={busy ? 'Listing…' : 'Create Listing'}
				variant="primary"
				disabled={busy}
				onPress={() => void onSubmit()}
			/>
			<Text variant="caption" tone="muted">
				1% KBVE Treasury fee applies on sale. Listing duration capped at
				30 days.
			</Text>
			{error ? <Text tone="danger">{error}</Text> : null}
			{success !== null ? (
				<Stack gap="xs">
					<Text tone="default">Listing #{success} created</Text>
					<Button
						title="View listing"
						variant="secondary"
						onPress={() => onCreated?.(success)}
					/>
				</Stack>
			) : null}
		</Stack>
	);
}

const styles = StyleSheet.create({
	half: { flex: 1, minWidth: 120 },
});

export default MarketCreateForm;
