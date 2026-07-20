import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../../ui/primitives/Button';
import { Text } from '../../ui/primitives/Text';
import { Stack } from '../../ui/primitives/Stack';
import { Surface } from '../../ui/primitives/Surface';
import { Badge } from '../../ui/primitives/Badge';
import { FormField } from '../../ui/primitives/FormField';
import { Select } from '../../ui/controls/Select';
import { createStoreApi } from './api';
import { StoreApiError } from './errors';
import type {
	Fulfillment,
	OrderStatus,
	StoreOrderStaff,
	StoreProduct,
	StoreVariant,
} from './types';

export interface StoreAdminViewProps {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
	authenticated: boolean;
}

const FULFILLMENTS: { value: Fulfillment; label: string }[] = [
	{ value: 'digital', label: 'digital' },
	{ value: 'physical', label: 'physical' },
	{ value: 'both', label: 'both' },
];

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
	paid: 'processing',
	processing: 'shipped',
	shipped: 'delivered',
};

function fmtErr(e: unknown): string {
	if (e instanceof StoreApiError) {
		if (e.status === 403) return 'Staff permissions required.';
		if (e.status === 401) return 'Sign in as staff.';
		return e.message || 'request failed';
	}
	return e instanceof Error ? e.message : 'request failed';
}

export function StoreAdminView({ getToken, baseUrl = '', authenticated }: StoreAdminViewProps) {
	const api = useMemo(() => createStoreApi({ getToken, baseUrl }), [getToken, baseUrl]);

	const [products, setProducts] = useState<StoreProduct[]>([]);
	const [orders, setOrders] = useState<StoreOrderStaff[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [orderBusy, setOrderBusy] = useState<number | null>(null);

	const [slug, setSlug] = useState('');
	const [title, setTitle] = useState('');
	const [price, setPrice] = useState('10');
	const [fulfillment, setFulfillment] = useState<Fulfillment>('digital');
	const [description, setDescription] = useState('');

	const [variantProduct, setVariantProduct] = useState('');
	const [sku, setSku] = useState('');
	const [variantPrice, setVariantPrice] = useState('10');
	const [stock, setStock] = useState('');
	const [attrs, setAttrs] = useState('{"size":"L"}');
	const [variants, setVariants] = useState<StoreVariant[]>([]);

	const [trackingFor, setTrackingFor] = useState<number | null>(null);
	const [trackingInput, setTrackingInput] = useState('');
	const [confirmRefundFor, setConfirmRefundFor] = useState<number | null>(null);

	const refresh = useCallback(async () => {
		try {
			setProducts(await api.catalog());
			setError(null);
		} catch (e) {
			setError(fmtErr(e));
		}
	}, [api]);

	const loadOrders = useCallback(async () => {
		try {
			setOrders(await api.staffListOrders());
			setError(null);
		} catch (e) {
			setError(fmtErr(e));
		}
	}, [api]);

	useEffect(() => {
		if (authenticated) {
			void refresh();
			void loadOrders();
		}
	}, [authenticated, refresh, loadOrders]);

	const loadVariants = useCallback(
		async (productSlug: string) => {
			if (!productSlug) {
				setVariants([]);
				return;
			}
			try {
				const d = await api.productDetail(productSlug);
				setVariants(d.variants);
			} catch {
				void 0;
				setVariants([]);
			}
		},
		[api],
	);

	const submitProduct = useCallback(async () => {
		setBusy(true);
		setError(null);
		try {
			await api.staffUpsertProduct({
				slug,
				title,
				description: description || null,
				price: Number(price),
				fulfillment,
			});
			await refresh();
		} catch (e) {
			setError(fmtErr(e));
		} finally {
			setBusy(false);
		}
	}, [api, slug, title, description, price, fulfillment, refresh]);

	const submitVariant = useCallback(async () => {
		setBusy(true);
		setError(null);
		try {
			let attributes: Record<string, unknown> = {};
			try {
				attributes = JSON.parse(attrs || '{}');
			} catch {
				void 0;
				throw new Error('attributes must be valid JSON');
			}
			await api.staffUpsertVariant(variantProduct, {
				sku,
				attributes,
				price: Number(variantPrice),
				stock: stock === '' ? null : Number(stock),
			});
			const p = products.find((x) => x.product_id === variantProduct);
			if (p) await loadVariants(p.slug);
		} catch (e) {
			setError(fmtErr(e));
		} finally {
			setBusy(false);
		}
	}, [api, variantProduct, sku, variantPrice, stock, attrs, products, loadVariants]);

	const retireProduct = useCallback(
		async (p: StoreProduct) => {
			try {
				await api.staffSetProductStatus(p.product_id, 'retired');
				await refresh();
			} catch (e) {
				setError(fmtErr(e));
			}
		},
		[api, refresh],
	);

	const retireVariant = useCallback(
		async (v: StoreVariant) => {
			try {
				await api.staffSetVariantStatus(v.variant_id, 'retired');
				const p = products.find((x) => x.product_id === variantProduct);
				if (p) await loadVariants(p.slug);
			} catch (e) {
				setError(fmtErr(e));
			}
		},
		[api, products, variantProduct, loadVariants],
	);

	const submitPod = useCallback(
		async (o: StoreOrderStaff) => {
			setOrderBusy(o.order_id);
			try {
				await api.staffSubmitPod(o.order_id);
				await loadOrders();
			} catch (e) {
				setError(fmtErr(e));
			} finally {
				setOrderBusy(null);
			}
		},
		[api, loadOrders],
	);

	const advance = useCallback(
		async (o: StoreOrderStaff, to: OrderStatus) => {
			setOrderBusy(o.order_id);
			try {
				await api.staffAdvanceOrder(o.order_id, {
					to_status: to,
					tracking: to === 'shipped' ? { number: trackingInput } : undefined,
				});
				setTrackingFor(null);
				setTrackingInput('');
				await loadOrders();
			} catch (e) {
				setError(fmtErr(e));
			} finally {
				setOrderBusy(null);
			}
		},
		[api, trackingInput, loadOrders],
	);

	const refund = useCallback(
		async (o: StoreOrderStaff) => {
			setOrderBusy(o.order_id);
			try {
				await api.staffRefundOrder(o.order_id, 'staff refund');
				setConfirmRefundFor(null);
				await loadOrders();
			} catch (e) {
				setError(fmtErr(e));
			} finally {
				setOrderBusy(null);
			}
		},
		[api, loadOrders],
	);

	if (!authenticated) return <Text tone="danger">Sign in as staff.</Text>;

	return (
		<Stack gap="lg">
			{error ? (
				<Text variant="caption" tone="danger">
					{error}
				</Text>
			) : null}

			<Surface>
				<Stack gap="md">
					<Text variant="subtitle">Products</Text>
					{products.map((p) => (
						<Stack key={p.product_id} direction="row" gap="sm" align="center" justify="space-between">
							<Text variant="caption">
								{p.title} · {p.slug} · {p.price} {p.currency} · {p.fulfillment} · {p.variant_count} variant(s)
							</Text>
							<Button title="Retire" variant="ghost" onPress={() => void retireProduct(p)} />
						</Stack>
					))}

					<Text variant="label">Upsert product</Text>
					<FormField label="slug" placeholder="slug" value={slug} onChangeText={setSlug} />
					<FormField label="title" placeholder="title" value={title} onChangeText={setTitle} />
					<FormField
						label="price (credits)"
						placeholder="price"
						keyboardType="numeric"
						value={price}
						onChangeText={setPrice}
					/>
					<Select value={fulfillment} options={FULFILLMENTS} onValueChange={setFulfillment} />
					<FormField
						label="description"
						placeholder="description"
						value={description}
						onChangeText={setDescription}
					/>
					<Button
						title="Save product"
						disabled={busy || !slug || !title}
						onPress={() => void submitProduct()}
					/>

					<Text variant="label">Upsert variant</Text>
					<Select
						value={variantProduct}
						options={products.map((p) => ({ value: p.product_id, label: p.title }))}
						onValueChange={(v) => {
							setVariantProduct(v);
							const p = products.find((x) => x.product_id === v);
							if (p) void loadVariants(p.slug);
						}}
					/>
					<FormField label="sku" placeholder="sku" value={sku} onChangeText={setSku} />
					<FormField
						label="price (credits)"
						placeholder="price"
						keyboardType="numeric"
						value={variantPrice}
						onChangeText={setVariantPrice}
					/>
					<FormField
						label="stock (blank = unlimited)"
						placeholder="stock"
						value={stock}
						onChangeText={setStock}
					/>
					<FormField
						label="attributes JSON"
						placeholder='{"size":"L"}'
						value={attrs}
						onChangeText={setAttrs}
					/>
					<Button
						title="Save variant"
						disabled={busy || !variantProduct || !sku}
						onPress={() => void submitVariant()}
					/>
					{variants.map((v) => (
						<Stack key={v.variant_id} direction="row" gap="sm" align="center" justify="space-between">
							<Text variant="caption">
								{v.sku} · {v.price} · stock {v.stock ?? '∞'}
							</Text>
							<Button title="Retire" variant="ghost" onPress={() => void retireVariant(v)} />
						</Stack>
					))}
				</Stack>
			</Surface>

			<Surface>
				<Stack gap="md">
					<Text variant="subtitle">Order queue</Text>
					{orders.map((o) => {
						const to = NEXT[o.status];
						const disabled = orderBusy === o.order_id;
						return (
							<Stack key={o.order_id} gap="sm">
								<Stack direction="row" gap="sm" align="center">
									<Text variant="caption">
										#{o.order_id} · {o.qty}× · {o.credits_amount} credits
									</Text>
									<Badge label={o.status} />
								</Stack>
								<Stack direction="row" gap="sm" wrap>
									{o.status === 'paid' ? (
										<Button
											title="Submit POD"
											variant="ghost"
											disabled={disabled}
											onPress={() => void submitPod(o)}
										/>
									) : null}
									{to ? (
										<Button
											title={`→ ${to}`}
											variant="ghost"
											disabled={disabled}
											onPress={() => {
												if (to === 'shipped') {
													setTrackingFor(o.order_id);
													setTrackingInput('');
												} else {
													void advance(o, to);
												}
											}}
										/>
									) : null}
									{o.status !== 'refunded' && o.status !== 'cancelled' ? (
										<Button
											title={confirmRefundFor === o.order_id ? 'Confirm refund' : 'Refund'}
											variant={confirmRefundFor === o.order_id ? 'danger' : 'ghost'}
											disabled={disabled}
											onPress={() => {
												if (confirmRefundFor === o.order_id) {
													void refund(o);
												} else {
													setConfirmRefundFor(o.order_id);
												}
											}}
										/>
									) : null}
								</Stack>
								{trackingFor === o.order_id && to === 'shipped' ? (
									<Stack direction="row" gap="sm" align="center">
										<FormField
											label="tracking number"
											placeholder="tracking number"
											value={trackingInput}
											onChangeText={setTrackingInput}
										/>
										<Button
											title="Confirm ship"
											disabled={disabled}
											onPress={() => void advance(o, 'shipped')}
										/>
									</Stack>
								) : null}
							</Stack>
						);
					})}
				</Stack>
			</Surface>
		</Stack>
	);
}
