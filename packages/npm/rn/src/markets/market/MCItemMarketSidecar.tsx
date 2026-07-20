import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge } from '../../ui/primitives/Badge';
import { Stack } from '../../ui/primitives/Stack';
import { Surface } from '../../ui/primitives/Surface';
import { Text } from '../../ui/primitives/Text';
import { tokens } from '../../ui/theme';
import { createMarketApi } from './api';
import { MarketApiError } from './errors';
import { formatKhash, formatRelative, itemRefLabel } from './format';
import { ItemIcon } from './ItemIcon';
import type { MarketListing } from './types';

const PAGE_LIMIT = 100;
const CARD_LIMIT = 6;

export interface MCItemMarketSidecarProps {
	itemRef: string;
	excludeListingId?: number;
	getToken?: () => Promise<string | null>;
	baseUrl?: string;
}

type ItemRefShape = {
	kind?: unknown;
	id?: unknown;
	display_name?: unknown;
};

function matches(itemRef: unknown, targetRef: string): boolean {
	if (!itemRef || typeof itemRef !== 'object') return false;
	const r = itemRef as ItemRefShape;
	if (r.kind !== 'mc_item') return false;
	if (r.id === null || r.id === undefined) return false;
	return String(r.id) === targetRef;
}

function buyNowSort(a: MarketListing, b: MarketListing): number {
	const av = a.buy_now_price;
	const bv = b.buy_now_price;
	if (av === null && bv === null) return 0;
	if (av === null) return 1;
	if (bv === null) return -1;
	return av - bv;
}

function formatAmount(n: number | null): string {
	if (n === null) return '—';
	return n.toLocaleString();
}

function median(sortedAsc: number[]): number | null {
	if (sortedAsc.length === 0) return null;
	const mid = Math.floor(sortedAsc.length / 2);
	if (sortedAsc.length % 2 === 1) return sortedAsc[mid];
	return Math.round((sortedAsc[mid - 1] + sortedAsc[mid]) / 2);
}

function extractDisplayName(itemRef: unknown): string {
	if (!itemRef || typeof itemRef !== 'object') return itemRefLabel(itemRef);
	const r = itemRef as ItemRefShape;
	if (typeof r.display_name === 'string' && r.display_name.length > 0)
		return r.display_name;
	if (typeof r.id === 'string' || typeof r.id === 'number')
		return String(r.id);
	return itemRefLabel(itemRef);
}

function openListing(id: number): void {
	if (typeof window !== 'undefined') {
		window.location.href = `/market/listing/?id=${id}`;
	}
}

const defaultGetToken = async () => null;

export function MCItemMarketSidecar({
	itemRef,
	excludeListingId,
	getToken = defaultGetToken,
	baseUrl = '',
}: MCItemMarketSidecarProps) {
	const api = useMemo(
		() => createMarketApi({ getToken, baseUrl }),
		[getToken, baseUrl],
	);
	const [rows, setRows] = useState<MarketListing[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		(async () => {
			try {
				const first = await api.listActive({ limit: PAGE_LIMIT });
				let combined = first;
				if (first.length >= PAGE_LIMIT) {
					const last = first[first.length - 1];
					const second = await api.listActive({
						limit: PAGE_LIMIT,
						before_created_at: last.created_at,
						before_id: last.listing_id,
					});
					combined = first.concat(second);
				}
				if (!cancelled) {
					setRows(combined);
					setLoading(false);
				}
			} catch (e) {
				if (cancelled) return;
				setError(
					e instanceof MarketApiError
						? e.message
						: 'failed to load market listings',
				);
				setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [api, itemRef]);

	const filtered = useMemo(() => {
		if (!rows) return [];
		return rows.filter(
			(r) =>
				matches(r.item_ref, itemRef) &&
				r.listing_id !== excludeListingId,
		);
	}, [rows, itemRef, excludeListingId]);

	const stats = useMemo(() => {
		if (filtered.length === 0) return null;
		const buyNows = filtered
			.map((r) => r.buy_now_price)
			.filter((v): v is number => v !== null)
			.sort((a, b) => a - b);
		const currentBids = filtered
			.map((r) => r.current_bid)
			.filter((v): v is number => v !== null)
			.sort((a, b) => a - b);
		const now = Date.now();
		const futureExpiries = filtered
			.map((r) => new Date(r.expires_at).getTime())
			.filter((t) => Number.isFinite(t) && t > now)
			.sort((a, b) => a - b);
		return {
			count: filtered.length,
			minBuyNow: buyNows.length > 0 ? buyNows[0] : null,
			maxBuyNow: buyNows.length > 0 ? buyNows[buyNows.length - 1] : null,
			medianBuyNow: median(buyNows),
			currentBidMin: currentBids.length > 0 ? currentBids[0] : null,
			currentBidMax:
				currentBids.length > 0
					? currentBids[currentBids.length - 1]
					: null,
			nextExpiry:
				futureExpiries.length > 0
					? new Date(futureExpiries[0]).toISOString()
					: null,
		};
	}, [filtered]);

	const cards = useMemo(() => {
		return filtered.slice().sort(buyNowSort).slice(0, CARD_LIMIT);
	}, [filtered]);

	const header = (
		<Stack direction="row" gap="sm" align="center" justify="space-between">
			<Text variant="subtitle">Other live listings for this item</Text>
			{stats ? <Badge label={String(stats.count)} /> : null}
		</Stack>
	);

	if (loading) {
		return (
			<Surface>
				<Stack gap="md">
					{header}
					<Text variant="caption" tone="muted">
						Loading market listings…
					</Text>
				</Stack>
			</Surface>
		);
	}

	if (error) {
		return (
			<Surface>
				<Stack gap="md">
					{header}
					<Text variant="caption" tone="danger">
						{error}
					</Text>
				</Stack>
			</Surface>
		);
	}

	if (!stats || filtered.length === 0) {
		return (
			<Surface>
				<Stack gap="md">
					{header}
					<Text variant="caption" tone="muted">
						No other active listings for this item.
					</Text>
				</Stack>
			</Surface>
		);
	}

	const bidRange =
		stats.currentBidMin === null
			? '—'
			: stats.currentBidMin === stats.currentBidMax
				? formatKhash(stats.currentBidMin)
				: `${formatKhash(stats.currentBidMin)} – ${formatKhash(stats.currentBidMax)}`;

	const statItems: Array<{ label: string; value: string }> = [
		{ label: 'Listings', value: String(stats.count) },
		{ label: 'Min Buy Now', value: formatAmount(stats.minBuyNow) },
		{ label: 'Median Buy Now', value: formatAmount(stats.medianBuyNow) },
		{ label: 'Max Buy Now', value: formatAmount(stats.maxBuyNow) },
		{ label: 'Bid Range', value: bidRange },
		{
			label: 'Next Expiry',
			value: stats.nextExpiry ? formatRelative(stats.nextExpiry) : '—',
		},
	];

	return (
		<Surface>
			<Stack gap="md">
				{header}
				<View style={styles.statGrid}>
					{statItems.map((s) => (
						<View key={s.label} style={styles.statCell}>
							<Text variant="caption" tone="muted">
								{s.label}
							</Text>
							<Text variant="body" weight="medium">
								{s.value}
							</Text>
						</View>
					))}
				</View>
				<View style={styles.cardGrid}>
					{cards.map((r) => (
						<Pressable
							key={r.listing_id}
							onPress={() => openListing(r.listing_id)}
							accessibilityRole="button"
							style={styles.card}>
							<Surface elevated style={styles.cardSurface}>
								<Stack direction="row" gap="sm" align="center">
									<ItemIcon
										itemRef={{ kind: 'mc_item', id: itemRef }}
										size={48}
									/>
									<Stack gap="xs" style={styles.cardBody}>
										<Text variant="label">
											{extractDisplayName(r.item_ref)}
										</Text>
										<Stack direction="row" gap="sm" wrap>
											<Text variant="body" weight="medium">
												{formatKhash(r.buy_now_price)}
											</Text>
											<Text variant="caption" tone="muted">
												Bid {formatKhash(r.current_bid)}
											</Text>
										</Stack>
										<Text variant="caption" tone="faint">
											{formatRelative(r.created_at)}
										</Text>
									</Stack>
								</Stack>
							</Surface>
						</Pressable>
					))}
				</View>
			</Stack>
		</Surface>
	);
}

const styles = StyleSheet.create({
	statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.sm },
	statCell: { flexGrow: 1, flexBasis: 120 },
	cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.sm },
	card: { flexGrow: 1, flexBasis: 220, maxWidth: '100%' },
	cardSurface: { padding: tokens.space.md },
	cardBody: { flexShrink: 1 },
});
