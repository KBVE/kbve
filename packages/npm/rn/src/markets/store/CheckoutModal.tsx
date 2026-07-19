import { useEffect, useState } from 'react';
import { Button } from '../../ui/primitives/Button';
import { FormField } from '../../ui/primitives/FormField';
import { Select } from '../../ui/controls/Select';
import { Stack } from '../../ui/primitives/Stack';
import { Surface } from '../../ui/primitives/Surface';
import { Text } from '../../ui/primitives/Text';
import type { StoreApi } from './api';
import type { ShippingAddress, StoreVariant } from './types';
import { StoreApiError } from './errors';
import { notifyWalletRefresh } from './walletSync';

const EMPTY_ADDR: ShippingAddress = {
	name: '', line1: '', line2: '', city: '', region: '', postal_code: '', country: '',
};

const ADDR_FIELDS: [keyof ShippingAddress, string][] = [
	['name', 'Full name'],
	['line1', 'Address line 1'],
	['line2', 'Address line 2'],
	['city', 'City'],
	['region', 'State / region'],
	['postal_code', 'Postal code'],
	['country', 'Country'],
];

export interface CheckoutModalProps {
	api: StoreApi;
	slug: string;
	onClose: () => void;
	onPurchased?: (orderId: number) => void;
}

export function CheckoutModal({ api, slug, onClose, onPurchased }: CheckoutModalProps) {
	const [variants, setVariants] = useState<StoreVariant[]>([]);
	const [variantId, setVariantId] = useState('');
	const [qty, setQty] = useState('1');
	const [addr, setAddr] = useState<ShippingAddress>(EMPTY_ADDR);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState<number | null>(null);

	useEffect(() => {
		void api
			.productDetail(slug)
			.then((d) => {
				setVariants(d.variants);
				if (d.variants[0]) setVariantId(d.variants[0].variant_id);
			})
			.catch((e) => setError(e instanceof Error ? e.message : 'load failed'));
	}, [api, slug]);

	const submit = async () => {
		setBusy(true);
		setError(null);
		try {
			const res = await api.buyPhysical(variantId, {
				qty: Math.max(1, Number(qty) || 1),
				shipping_address: addr,
			});
			notifyWalletRefresh();
			setDone(res.order_id);
			onPurchased?.(res.order_id);
		} catch (e) {
			if (e instanceof StoreApiError) {
				if (e.status === 402) setError('Not enough credits.');
				else if (e.code === 'P1020' || e.status === 409)
					setError('Out of stock or duplicate. Try again.');
				else if (e.status === 401) setError('Sign in to buy.');
				else setError(e.message || 'purchase failed');
			} else setError(e instanceof Error ? e.message : 'purchase failed');
		} finally {
			setBusy(false);
		}
	};

	const set = (k: keyof ShippingAddress) => (v: string) =>
		setAddr((a) => ({ ...a, [k]: v }));

	const invalid =
		busy || !variantId || !addr.name || !addr.line1 || !addr.city ||
		!addr.postal_code || !addr.country;

	return (
		<Surface>
			<Stack gap="sm">
				<Stack direction="row" justify="space-between" align="center">
					<Text variant="subtitle">{done ? `Order #${done} placed` : 'Checkout'}</Text>
					<Button title="Close" variant="ghost" onPress={onClose} accessibilityLabel="Close" />
				</Stack>
				{done ? (
					<Text variant="caption" tone="muted">
						Paid in credits. Track it in your order history.
					</Text>
				) : (
					<>
						{error ? (
							<Text variant="caption" tone="danger">{error}</Text>
						) : null}
						<Select
							value={variantId}
							onValueChange={setVariantId}
							options={variants.map((v) => ({
								value: v.variant_id,
								label: `${v.sku} · ${v.price} credits · ${v.stock === null ? 'in stock' : `${v.stock} left`}`,
							}))}
						/>
						<FormField
							label="Qty"
							keyboardType="number-pad"
							value={qty}
							onChangeText={setQty}
						/>
						{ADDR_FIELDS.map(([k, label]) => (
							<FormField
								key={k}
								label={label}
								value={addr[k] ?? ''}
								onChangeText={set(k)}
							/>
						))}
						<Button
							title={busy ? 'Placing…' : 'Buy with credits'}
							variant="primary"
							disabled={invalid}
							onPress={() => void submit()}
						/>
					</>
				)}
			</Stack>
		</Surface>
	);
}
