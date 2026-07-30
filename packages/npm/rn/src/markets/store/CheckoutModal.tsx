import { useEffect, useState } from 'react';
import { Button } from '../../ui/primitives/Button';
import { FormField } from '../../ui/primitives/FormField';
import { Select } from '../../ui/controls/Select';
import { Stack } from '../../ui/primitives/Stack';
import { Surface } from '../../ui/primitives/Surface';
import { Text } from '../../ui/primitives/Text';
import type { StoreApi } from './api';
import type { ShippingAddress, StoreVariant } from './types';
import { ProgressBar } from '../../ui/feedback/ProgressBar';
import { StoreApiError } from './errors';
import { notifyWalletRefresh } from './walletSync';
import { PurchaseProgress, type PurchaseStatus } from './PurchaseProgress';

const EMPTY_ADDR: ShippingAddress = {
	name: '', line1: '', line2: '', city: '', region: '', postal_code: '', country: '',
};

const ADDR_FIELDS: [keyof ShippingAddress, string, boolean][] = [
	['name', 'Full name', true],
	['line1', 'Address line 1', true],
	['line2', 'Address line 2', false],
	['city', 'City', true],
	['region', 'State / region', false],
	['postal_code', 'Postal code', true],
	['country', 'Country', true],
];

const REQUIRED: (keyof ShippingAddress)[] = ADDR_FIELDS.filter(
	([, , req]) => req,
).map(([k]) => k);

const ORDER_STEPS = [
	'Reserving stock and charging credits',
	'Refreshing your orders',
	'Order placed',
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
	const [loaded, setLoaded] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState<number | null>(null);
	const [touched, setTouched] = useState<Partial<Record<keyof ShippingAddress, boolean>>>({});
	const [phase, setPhase] = useState<{
		activeIndex: number;
		status: PurchaseStatus;
		error?: string | null;
	} | null>(null);

	useEffect(() => {
		void api
			.productDetail(slug)
			.then((d) => {
				setVariants(d.variants);
				if (d.variants[0]) setVariantId(d.variants[0].variant_id);
				setLoaded(true);
			})
			.catch((e) => setError(e instanceof Error ? e.message : 'load failed'));
	}, [api, slug]);

	const submit = async () => {
		setBusy(true);
		setError(null);
		setPhase({ activeIndex: 0, status: 'running' });
		try {
			const res = await api.buyPhysical(variantId, {
				qty: Math.max(1, Number(qty) || 1),
				shipping_address: addr,
			});
			setPhase({ activeIndex: 1, status: 'running' });
			notifyWalletRefresh();
			setDone(res.order_id);
			onPurchased?.(res.order_id);
			setPhase({ activeIndex: 2, status: 'done' });
		} catch (e) {
			let msg: string;
			if (e instanceof StoreApiError) {
				if (e.status === 402) msg = 'Not enough credits.';
				else if (e.code === 'P1020' || e.status === 409)
					msg = 'Out of stock or duplicate. Try again.';
				else if (e.status === 401) msg = 'Sign in to buy.';
				else msg = e.message || 'purchase failed';
			} else msg = e instanceof Error ? e.message : 'purchase failed';
			setError(msg);
			setPhase({ activeIndex: 0, status: 'error', error: msg });
		} finally {
			setBusy(false);
		}
	};

	const set = (k: keyof ShippingAddress) => (v: string) => {
		setAddr((a) => ({ ...a, [k]: v }));
		setTouched((t) => (t[k] ? t : { ...t, [k]: true }));
	};

	const missing = REQUIRED.filter((k) => !addr[k]?.trim());
	const filled = REQUIRED.length - missing.length;
	const ready = variantId !== '' && missing.length === 0;
	const invalid = busy || !ready;

	return (
		<Surface>
			<Stack gap="sm">
				<Stack direction="row" justify="space-between" align="center">
					<Text variant="subtitle">{done ? `Order #${done} placed` : 'Checkout'}</Text>
					<Button title="Close" variant="ghost" onPress={onClose} accessibilityLabel="Close" />
				</Stack>
				{done ? (
					<Stack gap="sm">
						{phase ? (
							<PurchaseProgress
								steps={ORDER_STEPS}
								activeIndex={phase.activeIndex}
								status={phase.status}
								error={phase.error}
							/>
						) : null}
						<Text variant="caption" tone="muted">
							Paid in credits. Track it in your order history.
						</Text>
					</Stack>
				) : loaded && variants.length === 0 ? (
					<Text variant="caption" tone="muted">
						No shippable variant is listed for this product yet — nothing to
						check out.
					</Text>
				) : (
					<>
						{!loaded ? (
							<ProgressBar indeterminate label="Loading variants…" />
						) : null}
						{error && !busy ? (
							<Text variant="caption" tone="danger">{error}</Text>
						) : null}
						<ProgressBar
							value={filled / REQUIRED.length}
							tone={ready ? 'success' : 'primary'}
							label={
								ready
									? 'Shipping details complete'
									: `Shipping details — ${filled} of ${REQUIRED.length} required fields`
							}
						/>
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
							editable={!busy}
							onChangeText={setQty}
						/>
						{ADDR_FIELDS.map(([k, label, required]) => (
							<FormField
								key={k}
								label={required ? `${label} *` : label}
								value={addr[k] ?? ''}
								editable={!busy}
								error={
									required && touched[k] && !addr[k]?.trim()
										? `${label} is required`
										: null
								}
								onChangeText={set(k)}
							/>
						))}
						{phase ? (
							<PurchaseProgress
								steps={ORDER_STEPS}
								activeIndex={phase.activeIndex}
								status={phase.status}
								error={phase.error}
							/>
						) : null}
						<Button
							title={busy ? 'Placing your order…' : 'Buy with credits'}
							variant="primary"
							disabled={invalid}
							onPress={() => void submit()}
						/>
						{missing.length > 0 && !busy ? (
							<Text variant="caption" tone="faint">
								{`Still needed: ${missing
									.map(
										(k) =>
											ADDR_FIELDS.find(([key]) => key === k)?.[1] ??
											k,
									)
									.join(', ')}`}
							</Text>
						) : null}
					</>
				)}
			</Stack>
		</Surface>
	);
}
