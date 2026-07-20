import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge, type BadgeTone } from '../../ui/primitives/Badge';
import { Button } from '../../ui/primitives/Button';
import { Stack } from '../../ui/primitives/Stack';
import { Surface } from '../../ui/primitives/Surface';
import { Text } from '../../ui/primitives/Text';
import { tokens } from '../../ui/theme';
import { createMarketApi } from './api';
import { MarketApiError } from './errors';
import { EnchantList } from './EnchantList';
import { ItemIcon } from './ItemIcon';
import {
	formatExpiry,
	formatKhash,
	formatRelative,
	itemRefLabel,
} from './format';
import {
	getWatchList,
	removeFromWatch,
	subscribe,
	type WatchEntry,
} from './watchlist';
import type { BidStatus, ListingStatus, MyBid, MyListing } from './types';

type Tab = 'listings' | 'bids' | 'watching';

export interface MarketProfileViewProps {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
	authenticated: boolean;
}

function openListing(id: number): void {
	if (typeof window !== 'undefined') {
		window.location.href = `/market/listing/?id=${id}`;
	}
}

function statusTone(status: ListingStatus | BidStatus): BadgeTone {
	if (status === 'active') return 'success';
	if (status === 'sold' || status === 'won') return 'primary';
	if (status === 'cancelled' || status === 'refunded') return 'danger';
	if (status === 'expired' || status === 'outbid') return 'warning';
	return 'neutral';
}

export function MarketProfileView({
	getToken,
	baseUrl = '',
	authenticated,
}: MarketProfileViewProps) {
	const api = useMemo(
		() => createMarketApi({ getToken, baseUrl }),
		[getToken, baseUrl],
	);
	const [tab, setTab] = useState<Tab>('listings');
	const [listings, setListings] = useState<MyListing[]>([]);
	const [bids, setBids] = useState<MyBid[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [showClosed, setShowClosed] = useState(false);
	const [bidRefs, setBidRefs] = useState<Map<number, Record<string, unknown>>>(
		() => new Map(),
	);
	const [watchEntries, setWatchEntries] = useState<WatchEntry[]>([]);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const [ls, bs] = await Promise.all([
				api.myListings({ limit: 50 }),
				api.myBids({ limit: 50 }),
			]);
			setListings(ls);
			setBids(bs);
		} catch (e) {
			setError(e instanceof MarketApiError ? e.message : 'failed to load');
		} finally {
			setLoading(false);
		}
	}, [api]);

	useEffect(() => {
		if (authenticated) void refresh();
	}, [authenticated, refresh]);

	useEffect(() => {
		setWatchEntries(getWatchList());
		const unsub = subscribe(() => setWatchEntries(getWatchList()));
		return unsub;
	}, []);

	useEffect(() => {
		if (bids.length === 0) return;
		let cancelled = false;
		const missing = Array.from(
			new Set(
				bids.map((b) => b.listing_id).filter((id) => !bidRefs.has(id)),
			),
		);
		if (missing.length === 0) return;
		(async () => {
			const pairs = await Promise.all(
				missing.map(async (id) => {
					try {
						const d = await api.listingDetail(id);
						return [id, d.item_ref] as const;
					} catch {
						return null;
					}
				}),
			);
			if (cancelled) return;
			if (!pairs.some(Boolean)) return;
			setBidRefs((prev) => {
				const next = new Map(prev);
				for (const p of pairs) {
					if (p) next.set(p[0], p[1]);
				}
				return next;
			});
		})();
		return () => {
			cancelled = true;
		};
	}, [api, bids, bidRefs]);

	const activeListings = useMemo(
		() => listings.filter((r) => r.listing_status === 'active'),
		[listings],
	);
	const closedListings = useMemo(
		() => listings.filter((r) => r.listing_status !== 'active'),
		[listings],
	);

	if (!authenticated) {
		return (
			<Text variant="body" tone="muted">
				Sign in to view your marketplace activity.
			</Text>
		);
	}

	const renderListingCard = (r: MyListing) => (
		<Pressable
			key={r.listing_id}
			onPress={() => openListing(r.listing_id)}
			accessibilityRole="button">
			<Surface style={styles.card}>
				<Stack direction="row" gap="md" align="center">
					<ItemIcon itemRef={r.item_ref} size={48} />
					<Stack gap="xs" style={styles.grow}>
						<Stack direction="row" gap="xs" align="center" wrap>
							<Text variant="subtitle">
								{itemRefLabel(r.item_ref)}
							</Text>
							<EnchantList itemRef={r.item_ref} compact />
							<Badge
								label={r.listing_status}
								tone={statusTone(r.listing_status)}
							/>
						</Stack>
						<Stack direction="row" gap="md" align="center" wrap>
							{r.buy_now_price !== null ? (
								<Text variant="caption" tone="muted">
									Buy {formatKhash(r.buy_now_price)}
								</Text>
							) : null}
							{r.current_bid !== null ? (
								<Text variant="caption" tone="muted">
									Bid {formatKhash(r.current_bid)}
								</Text>
							) : null}
							<Text variant="caption" tone="faint">
								{r.listing_status === 'active'
									? formatExpiry(r.expires_at)
									: r.settled_at
										? formatRelative(r.settled_at)
										: '—'}
							</Text>
						</Stack>
					</Stack>
				</Stack>
			</Surface>
		</Pressable>
	);

	const renderBidCard = (b: MyBid) => {
		const itemRef = bidRefs.get(b.listing_id);
		return (
			<Pressable
				key={b.bid_id}
				onPress={() => openListing(b.listing_id)}
				accessibilityRole="button">
				<Surface style={styles.card}>
					<Stack direction="row" gap="md" align="center">
						{itemRef ? (
							<ItemIcon itemRef={itemRef} size={48} />
						) : (
							<View style={styles.thumbPlaceholder}>
								<Text variant="caption" tone="faint">
									…
								</Text>
							</View>
						)}
						<Stack gap="xs" style={styles.grow}>
							<Stack direction="row" gap="xs" align="center" wrap>
								<Text variant="subtitle">
									{itemRef
										? itemRefLabel(itemRef)
										: `Listing #${b.listing_id}`}
								</Text>
								{itemRef ? (
									<EnchantList itemRef={itemRef} compact />
								) : null}
								<Badge
									label={b.bid_status}
									tone={statusTone(b.bid_status)}
								/>
							</Stack>
							<Stack
								direction="row"
								gap="md"
								align="center"
								wrap>
								<Text variant="caption" tone="muted">
									{formatKhash(b.amount)}
								</Text>
								<Text variant="caption" tone="faint">
									{formatRelative(b.placed_at)}
								</Text>
							</Stack>
						</Stack>
					</Stack>
				</Surface>
			</Pressable>
		);
	};

	const renderWatchRow = (entry: WatchEntry) => (
		<Surface key={`${entry.kind}::${entry.ref}`} style={styles.card}>
			<Stack direction="row" gap="md" align="center">
				{entry.kind === 'mc_item' ? (
					<ItemIcon
						itemRef={{ kind: entry.kind, id: entry.ref }}
						size={48}
					/>
				) : (
					<View style={styles.thumbPlaceholder}>
						<Text variant="caption" tone="faint">
							…
						</Text>
					</View>
				)}
				<Stack gap="xs" style={styles.grow}>
					<Stack direction="row" gap="xs" align="center" wrap>
						<Text variant="subtitle">{entry.ref}</Text>
						<Badge label={entry.kind} />
					</Stack>
				</Stack>
				<Button
					title="Unwatch"
					variant="ghost"
					onPress={() => removeFromWatch(entry)}
				/>
			</Stack>
		</Surface>
	);

	return (
		<Stack gap="lg">
			<Stack direction="row" gap="sm" align="center" wrap>
				<Button
					title={`Listings (${activeListings.length})`}
					variant={tab === 'listings' ? 'primary' : 'ghost'}
					onPress={() => setTab('listings')}
				/>
				<Button
					title={`Bids (${bids.length})`}
					variant={tab === 'bids' ? 'primary' : 'ghost'}
					onPress={() => setTab('bids')}
				/>
				<Button
					title={`Watching (${watchEntries.length})`}
					variant={tab === 'watching' ? 'primary' : 'ghost'}
					onPress={() => setTab('watching')}
				/>
				<Button
					title="↻"
					variant="ghost"
					disabled={loading}
					onPress={() => void refresh()}
				/>
			</Stack>

			{error ? (
				<Text variant="body" tone="danger">
					{error}
				</Text>
			) : null}

			{tab === 'listings' ? (
				<Stack gap="md">
					{activeListings.length === 0 && !loading ? (
						<Text variant="body" tone="muted">
							No active listings.
						</Text>
					) : null}
					{activeListings.map((r) => renderListingCard(r))}
					{closedListings.length > 0 ? (
						<Button
							title={
								showClosed
									? `Hide past listings (${closedListings.length})`
									: `Show past listings (${closedListings.length})`
							}
							variant="ghost"
							onPress={() => setShowClosed((v) => !v)}
						/>
					) : null}
					{showClosed
						? closedListings.map((r) => renderListingCard(r))
						: null}
				</Stack>
			) : null}

			{tab === 'bids' ? (
				<Stack gap="md">
					{bids.length === 0 && !loading ? (
						<Text variant="body" tone="muted">
							No bids yet.
						</Text>
					) : null}
					{bids.map((b) => renderBidCard(b))}
				</Stack>
			) : null}

			{tab === 'watching' ? (
				<Stack gap="md">
					{watchEntries.length === 0 ? (
						<Text variant="body" tone="muted">
							No items watched yet. Star any item to track it here.
						</Text>
					) : null}
					{watchEntries.map((e) => renderWatchRow(e))}
				</Stack>
			) : null}
		</Stack>
	);
}

const styles = StyleSheet.create({
	card: { padding: tokens.space.md },
	grow: { flexGrow: 1, flexShrink: 1 },
	thumbPlaceholder: {
		width: 48,
		height: 48,
		borderRadius: 8,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: tokens.color.surfaceAlt,
	},
});

export default MarketProfileView;
