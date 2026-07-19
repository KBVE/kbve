import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from '../../ui/primitives/Stack';
import { Text } from '../../ui/primitives/Text';
import { tokens } from '../../ui/theme';
import { createStoreApi } from './api';
import { BuyCredits } from './BuyCredits';
import { ProductCard } from './ProductCard';
import { CheckoutModal } from './CheckoutModal';
import { OrderHistory } from './OrderHistory';
import { StoreApiError } from './errors';
import { notifyWalletRefresh } from './walletSync';
import { FEATURED_SLUG } from './types';
import type { StoreEntitlement, StoreOrder, StoreProduct } from './types';

export interface StoreViewProps {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
	authenticated: boolean;
}

export function StoreView({ getToken, baseUrl = '', authenticated }: StoreViewProps) {
	const api = useMemo(() => createStoreApi({ getToken, baseUrl }), [getToken, baseUrl]);
	const [products, setProducts] = useState<StoreProduct[]>([]);
	const [entitlements, setEntitlements] = useState<StoreEntitlement[]>([]);
	const [orders, setOrders] = useState<StoreOrder[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [busySlug, setBusySlug] = useState<string | null>(null);
	const [checkoutSlug, setCheckoutSlug] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			setProducts(await api.catalog());
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'load failed');
		}
		if (authenticated) {
			const [ents, ords] = await Promise.all([
				api.myEntitlements().catch(() => [] as StoreEntitlement[]),
				api.myOrders().catch(() => [] as StoreOrder[]),
			]);
			setEntitlements(ents);
			setOrders(ords);
		} else {
			setEntitlements([]);
			setOrders([]);
		}
	}, [api, authenticated]);

	useEffect(() => {
		void load();
	}, [load]);

	const owns = useCallback(
		(slug: string) => entitlements.some((e) => e.slug === slug),
		[entitlements],
	);

	const buyDigital = useCallback(
		async (slug: string) => {
			setBusySlug(slug);
			try {
				await api.buyProduct(slug);
				notifyWalletRefresh();
				setEntitlements(await api.myEntitlements().catch(() => entitlements));
			} catch (e) {
				if (e instanceof StoreApiError && e.status === 409) {
					notifyWalletRefresh();
					setEntitlements(await api.myEntitlements().catch(() => entitlements));
				} else {
					setError(e instanceof Error ? e.message : 'purchase failed');
				}
			} finally {
				setBusySlug(null);
			}
		},
		[api, entitlements],
	);

	const featured = products.find((p) => p.slug === FEATURED_SLUG);
	const rest = products.filter((p) => p.slug !== FEATURED_SLUG);

	return (
		<Stack gap="lg">
			<BuyCredits api={api} authenticated={authenticated} />
			{error ? (
				<Text variant="caption" tone="danger">{error}</Text>
			) : null}
			{featured ? (
				<ProductCard
					product={featured}
					owned={owns(featured.slug)}
					authenticated={authenticated}
					busy={busySlug === featured.slug}
					onBuyDigital={(s) => void buyDigital(s)}
					onBuyPhysical={setCheckoutSlug}
				/>
			) : null}
			<Text variant="subtitle">All products</Text>
			<View style={styles.grid}>
				{rest.map((p) => (
					<View key={p.product_id} style={styles.cell}>
						<ProductCard
							product={p}
							owned={owns(p.slug)}
							authenticated={authenticated}
							busy={busySlug === p.slug}
							onBuyDigital={(s) => void buyDigital(s)}
							onBuyPhysical={setCheckoutSlug}
						/>
					</View>
				))}
			</View>
			<OrderHistory orders={orders} />
			{checkoutSlug ? (
				<CheckoutModal
					api={api}
					slug={checkoutSlug}
					onClose={() => setCheckoutSlug(null)}
					onPurchased={() => void load()}
				/>
			) : null}
		</Stack>
	);
}

const styles = StyleSheet.create({
	grid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.md },
	cell: { flexGrow: 1, flexBasis: 300, maxWidth: '100%' },
});
