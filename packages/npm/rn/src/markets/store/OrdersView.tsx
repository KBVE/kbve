import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Badge } from '../../ui/primitives/Badge';
import { Stack } from '../../ui/primitives/Stack';
import { Surface } from '../../ui/primitives/Surface';
import { Text } from '../../ui/primitives/Text';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { SkeletonGroup } from '../../ui/feedback/Skeleton';
import { tokens } from '../../ui/theme';
import { createStoreApi } from './api';
import type { StoreOrder, StorePurchase } from './types';

export interface OrdersViewProps {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
	authenticated: boolean;
}

type Entry =
	| { kind: 'purchase'; at: string; row: StorePurchase }
	| { kind: 'order'; at: string; row: StoreOrder };

const ORDER_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> =
	{
		paid: 'neutral',
		processing: 'warning',
		shipped: 'warning',
		delivered: 'success',
		cancelled: 'danger',
		refunded: 'danger',
	};

function when(iso: string): string {
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function PurchaseRow({ row }: { row: StorePurchase }) {
	const reBuy = row.result_kind === 'already_owned';
	return (
		<Surface>
			<Stack gap="xs">
				<Stack direction="row" justify="space-between" align="center">
					<Text variant="subtitle">{row.title}</Text>
					<Badge
						tone={reBuy ? 'neutral' : 'success'}
						label={reBuy ? 'already owned' : 'unlocked'}
					/>
				</Stack>
				<Text variant="caption" tone="muted">
					{reBuy
						? 'You already owned this — no credits were charged.'
						: `${row.price.toLocaleString()} ${row.currency}`}
				</Text>
				<Stack direction="row" justify="space-between" align="center">
					<Text variant="caption" tone="faint">
						{`Receipt #${row.purchase_id} · ${when(row.created_at)}`}
					</Text>
					<Text variant="caption" tone="faint">
						digital
					</Text>
				</Stack>
			</Stack>
		</Surface>
	);
}

function OrderRow({ row }: { row: StoreOrder }) {
	const tracking =
		typeof row.tracking?.carrier === 'string' ||
		typeof row.tracking?.code === 'string'
			? [row.tracking.carrier, row.tracking.code]
					.filter(Boolean)
					.join(' · ')
			: null;
	return (
		<Surface>
			<Stack gap="xs">
				<Stack direction="row" justify="space-between" align="center">
					<Text variant="subtitle">{row.product_title}</Text>
					<Badge
						tone={ORDER_TONE[row.status] ?? 'neutral'}
						label={row.status}
					/>
				</Stack>
				<Text variant="caption" tone="muted">
					{`${row.qty}× ${row.variant_sku} · ${row.credits_amount.toLocaleString()} ${row.currency}`}
				</Text>
				{row.fulfillment === 'both' ? (
					<Text variant="caption" tone="muted">
						Ships to you, and the digital copy is already in your
						inventory.
					</Text>
				) : null}
				{tracking ? (
					<Text variant="caption" tone="muted">
						{`Tracking: ${tracking}`}
					</Text>
				) : null}
				<Stack direction="row" justify="space-between" align="center">
					<Text variant="caption" tone="faint">
						{`Order #${row.order_id} · ${when(row.created_at)}`}
					</Text>
					<Text variant="caption" tone="faint">
						shipped goods
					</Text>
				</Stack>
			</Stack>
		</Surface>
	);
}

export function OrdersView({
	getToken,
	baseUrl = '',
	authenticated,
}: OrdersViewProps) {
	const api = useMemo(
		() => createStoreApi({ getToken, baseUrl }),
		[getToken, baseUrl],
	);
	const [purchases, setPurchases] = useState<StorePurchase[]>([]);
	const [orders, setOrders] = useState<StoreOrder[]>([]);
	const [loaded, setLoaded] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		if (!authenticated) {
			setLoaded(true);
			return;
		}
		try {
			const [p, o] = await Promise.all([
				api.myPurchases().catch(() => [] as StorePurchase[]),
				api.myOrders().catch(() => [] as StoreOrder[]),
			]);
			setPurchases(p);
			setOrders(o);
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'load failed');
		} finally {
			setLoaded(true);
		}
	}, [api, authenticated]);

	useEffect(() => {
		void load();
	}, [load]);

	const entries: Entry[] = useMemo(() => {
		const merged: Entry[] = [
			...purchases.map((row) => ({
				kind: 'purchase' as const,
				at: row.created_at,
				row,
			})),
			...orders.map((row) => ({
				kind: 'order' as const,
				at: row.created_at,
				row,
			})),
		];
		return merged.sort((a, b) => b.at.localeCompare(a.at));
	}, [purchases, orders]);

	const spent =
		purchases.reduce((sum, p) => sum + p.price, 0) +
		orders
			.filter((o) => o.status !== 'refunded' && o.status !== 'cancelled')
			.reduce((sum, o) => sum + o.credits_amount, 0);

	if (!authenticated) {
		return (
			<EmptyState
				title="Sign in to see your orders"
				message="Your purchase receipts and shipped orders live here once you are signed in."
			/>
		);
	}

	if (!loaded) return <SkeletonGroup rows={4} />;

	if (error) {
		return (
			<Text variant="caption" tone="danger">
				{error}
			</Text>
		);
	}

	if (entries.length === 0) {
		return (
			<EmptyState
				title="No purchases yet"
				message="Buy something in the store and the receipt shows up here."
			/>
		);
	}

	return (
		<Stack gap="md">
			<Stack direction="row" gap="md" wrap>
				<View style={styles.stat}>
					<Text variant="title">{entries.length}</Text>
					<Text variant="caption" tone="muted">
						{entries.length === 1 ? 'purchase' : 'purchases'}
					</Text>
				</View>
				<View style={styles.stat}>
					<Text variant="title">{spent.toLocaleString()}</Text>
					<Text variant="caption" tone="muted">
						credits spent
					</Text>
				</View>
			</Stack>
			{entries.map((e) =>
				e.kind === 'purchase' ? (
					<PurchaseRow key={`p-${e.row.purchase_id}`} row={e.row} />
				) : (
					<OrderRow key={`o-${e.row.order_id}`} row={e.row} />
				),
			)}
		</Stack>
	);
}

const styles = StyleSheet.create({
	stat: {
		flexGrow: 1,
		flexBasis: 140,
		gap: tokens.space.xs,
		padding: tokens.space.md,
		borderWidth: 1,
		borderColor: tokens.color.border,
		borderRadius: tokens.radius.md,
		backgroundColor: tokens.color.bgSubtle,
	},
});

export default OrdersView;
