import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from '../../ui/primitives/Stack';
import { Text } from '../../ui/primitives/Text';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton, SkeletonGroup } from '../../ui/feedback/Skeleton';
import { tokens } from '../../ui/theme';
import { createStoreApi } from './api';
import { BuyCredits } from './BuyCredits';
import { ProductCard } from './ProductCard';
import { IdiotCard } from './IdiotCard';
import { CheckoutModal } from './CheckoutModal';
import { OrderHistory } from './OrderHistory';
import { PurchaseProgress, type PurchaseStatus } from './PurchaseProgress';
import { StoreApiError } from './errors';
import { notifyWalletRefresh } from './walletSync';
import { FEATURED_SLUG } from './types';
import type { StoreEntitlement, StoreOrder, StoreProduct } from './types';

const DIGITAL_STEPS = [
	'Charging credits and minting your item',
	'Syncing wallet and inventory',
	'Unlocked — it is yours',
];

export interface StoreViewProps {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
	authenticated: boolean;
}

export function StoreView({
	getToken,
	baseUrl = '',
	authenticated,
}: StoreViewProps) {
	const api = useMemo(
		() => createStoreApi({ getToken, baseUrl }),
		[getToken, baseUrl],
	);
	const [products, setProducts] = useState<StoreProduct[]>([]);
	const [entitlements, setEntitlements] = useState<StoreEntitlement[]>([]);
	const [orders, setOrders] = useState<StoreOrder[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loaded, setLoaded] = useState(false);
	const [busySlug, setBusySlug] = useState<string | null>(null);
	const [checkoutSlug, setCheckoutSlug] = useState<string | null>(null);
	const [progress, setProgress] = useState<{
		slug: string;
		activeIndex: number;
		status: PurchaseStatus;
		error?: string | null;
	} | null>(null);

	const load = useCallback(async () => {
		try {
			setProducts(await api.catalog());
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'load failed');
		} finally {
			setLoaded(true);
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
			setError(null);
			setProgress({ slug, activeIndex: 0, status: 'running' });
			const sync = async () => {
				setProgress({ slug, activeIndex: 1, status: 'running' });
				notifyWalletRefresh();
				setEntitlements(
					await api.myEntitlements().catch(() => entitlements),
				);
				setProgress({ slug, activeIndex: 2, status: 'done' });
			};
			try {
				await api.buyProduct(slug);
				await sync();
			} catch (e) {
				if (e instanceof StoreApiError && e.status === 409) {
					await sync();
				} else {
					const msg =
						e instanceof StoreApiError && e.status === 402
							? 'Not enough credits. Top up above and try again.'
							: e instanceof StoreApiError && e.status === 401
								? 'Sign in to buy.'
								: e instanceof Error
									? e.message
									: 'purchase failed';
					setProgress((p) =>
						p && p.slug === slug
							? { ...p, status: 'error', error: msg }
							: p,
					);
				}
			} finally {
				setBusySlug(null);
			}
		},
		[api, entitlements],
	);

	const featured = products.find((p) => p.slug === FEATURED_SLUG);
	const rest = products.filter((p) => p.slug !== FEATURED_SLUG);

	const progressFor = (slug: string) =>
		progress && progress.slug === slug ? (
			<PurchaseProgress
				steps={DIGITAL_STEPS}
				activeIndex={progress.activeIndex}
				status={progress.status}
				error={progress.error}
			/>
		) : null;

	return (
		<Stack gap="lg">
			<BuyCredits api={api} authenticated={authenticated} />
			{error ? (
				<Text variant="caption" tone="danger">
					{error}
				</Text>
			) : null}
			{featured ? (
				<Stack gap="md">
					<IdiotCard revealed={owns(featured.slug)} />
					<ProductCard
						product={featured}
						owned={owns(featured.slug)}
						authenticated={authenticated}
						busy={busySlug === featured.slug}
						onBuyDigital={(s) => void buyDigital(s)}
						onBuyPhysical={setCheckoutSlug}
					/>
					{progressFor(featured.slug)}
				</Stack>
			) : null}
			{!loaded ? (
				<Stack gap="sm">
					<Skeleton height={22} width="40%" />
					<SkeletonGroup rows={3} />
				</Stack>
			) : products.length === 0 ? (
				<EmptyState
					title="The shelves are empty"
					message="No products are listed right now. Check back after the next drop."
				/>
			) : rest.length === 0 ? (
				<Text variant="caption" tone="muted">
					This is the only drop live right now — more are on the way.
				</Text>
			) : (
				<Text variant="subtitle">All products</Text>
			)}
			<View style={styles.grid}>
				{rest.map((p) => (
					<View key={p.product_id} style={styles.cell}>
						<Stack gap="sm">
							<ProductCard
								product={p}
								owned={owns(p.slug)}
								authenticated={authenticated}
								busy={busySlug === p.slug}
								onBuyDigital={(s) => void buyDigital(s)}
								onBuyPhysical={setCheckoutSlug}
							/>
							{progressFor(p.slug)}
						</Stack>
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
