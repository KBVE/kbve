import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge } from '../../ui/primitives/Badge';
import { Button } from '../../ui/primitives/Button';
import { FormField } from '../../ui/primitives/FormField';
import { Stack } from '../../ui/primitives/Stack';
import { Surface } from '../../ui/primitives/Surface';
import { Text } from '../../ui/primitives/Text';
import { notifyWalletRefresh } from '../shared';
import type { MarketApi } from './api';
import { MarketApiError } from './errors';
import { useCountdown, formatCountdown } from './countdown';
import { ItemIcon } from './ItemIcon';
import { EnchantList } from './EnchantList';
import { WatchToggle } from './WatchToggle';
import { formatKhash, formatRelative, itemRefLabel } from './format';
import type { MarketListingDetail } from './types';

export interface ListingDetailProps {
	api: MarketApi;
	listingId: number | null;
	authenticated: boolean;
	myAccount: string | null;
	onBack: () => void;
}

export function ListingDetail({
	api,
	listingId,
	authenticated,
	myAccount,
	onBack,
}: ListingDetailProps) {
	const [row, setRow] = useState<MarketListingDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [actionBusy, setActionBusy] = useState<string | null>(null);
	const [bidInput, setBidInput] = useState('');

	const refresh = useCallback(async () => {
		if (listingId == null) return;
		setLoading(true);
		try {
			const d = await api.listingDetail(listingId);
			setRow(d);
			setError(null);
		} catch (e) {
			setError(
				e instanceof MarketApiError ? e.message : 'failed to load listing',
			);
		} finally {
			setLoading(false);
		}
	}, [api, listingId]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const countdown = useCountdown(row?.expires_at);

	const isSeller = useMemo(
		() => Boolean(row && myAccount && row.seller_account === myAccount),
		[row, myAccount],
	);

	const active = row?.listing_status === 'active';
	const minNextBid = row
		? (row.current_bid ?? ((row.min_bid ?? 1) - 1)) + 1
		: 1;

	const onBid = async () => {
		if (!row) return;
		const amount = Number(bidInput);
		if (!Number.isFinite(amount) || amount <= 0) {
			setActionError('bid must be a positive integer');
			return;
		}
		setActionBusy('bid');
		setActionError(null);
		try {
			await api.placeBid(row.listing_id, Math.floor(amount));
			setBidInput('');
			notifyWalletRefresh();
			await refresh();
		} catch (e) {
			setActionError(e instanceof MarketApiError ? e.message : 'bid failed');
		} finally {
			setActionBusy(null);
		}
	};

	const onBuyNow = async () => {
		if (!row) return;
		setActionBusy('buy');
		setActionError(null);
		try {
			await api.buyNow(row.listing_id);
			notifyWalletRefresh();
			await refresh();
		} catch (e) {
			setActionError(
				e instanceof MarketApiError ? e.message : 'buy-now failed',
			);
		} finally {
			setActionBusy(null);
		}
	};

	const onCancel = async () => {
		if (!row) return;
		setActionBusy('cancel');
		setActionError(null);
		try {
			await api.cancelListing(row.listing_id);
			await refresh();
		} catch (e) {
			setActionError(
				e instanceof MarketApiError ? e.message : 'cancel failed',
			);
		} finally {
			setActionBusy(null);
		}
	};

	if (listingId == null) {
		return <Text tone="muted">Missing or invalid listing id.</Text>;
	}
	if (loading && !row) {
		return <Text tone="muted">Loading listing…</Text>;
	}
	if (error && !row) {
		return <Text tone="danger">{error}</Text>;
	}
	if (!row) return null;

	const refObj = (row.item_ref ?? {}) as { kind?: unknown; id?: unknown };
	const refKind = typeof refObj.kind === 'string' ? refObj.kind : '';
	const refId =
		typeof refObj.id === 'string' || typeof refObj.id === 'number'
			? String(refObj.id)
			: '';

	return (
		<Stack gap="lg">
			<Pressable onPress={onBack} accessibilityRole="button">
				<Text tone="muted">← Browse</Text>
			</Pressable>

			<Surface>
				<Stack direction="row" gap="lg" wrap>
					<View style={styles.icon}>
						<ItemIcon itemRef={row.item_ref} size={128} />
					</View>
					<Stack gap="xs" style={styles.grow}>
						<Stack direction="row" gap="xs" align="center" wrap>
							<Text variant="title">{itemRefLabel(row.item_ref)}</Text>
							<EnchantList itemRef={row.item_ref} />
						</Stack>
						{refKind && refId ? (
							<WatchToggle kind={refKind} itemRef={refId} />
						) : null}
						<Badge label={row.listing_status} />
						<Text variant="caption" tone="muted">
							Seller {row.seller_account}
						</Text>
						<Text variant="caption" tone="muted">
							Listed {formatRelative(row.created_at)}
						</Text>
						<Text tone={active && countdown.totalMs < 60_000 ? 'danger' : 'muted'}>
							{active
								? formatCountdown(countdown)
								: row.settled_at
									? formatRelative(row.settled_at)
									: 'Closed'}
						</Text>
					</Stack>
				</Stack>

				<Stack direction="row" gap="lg" wrap>
					{row.buy_now_price !== null ? (
						<Stack gap="xs">
							<Text variant="caption" tone="muted">
								Buy-Now Price
							</Text>
							<Text variant="body" weight="medium">
								{formatKhash(row.buy_now_price)}
							</Text>
						</Stack>
					) : null}
					<Stack gap="xs">
						<Text variant="caption" tone="muted">
							{row.current_bid !== null ? 'Current Bid' : 'Min Bid'}
						</Text>
						<Text variant="body" weight="medium">
							{formatKhash(row.current_bid ?? row.min_bid)}
						</Text>
					</Stack>
				</Stack>

				{active && authenticated && !isSeller ? (
					<Stack gap="md">
						{row.buy_now_price !== null ? (
							<Button
								title={
									actionBusy === 'buy'
										? 'Buying…'
										: `Buy Now · ${formatKhash(row.buy_now_price)}`
								}
								variant="primary"
								disabled={actionBusy !== null}
								onPress={() => void onBuyNow()}
							/>
						) : null}
						{row.min_bid !== null ? (
							<Stack gap="xs">
								<FormField
									label="Your Bid"
									placeholder={`min ${minNextBid}`}
									value={bidInput}
									onChangeText={setBidInput}
									keyboardType="number-pad"
								/>
								<Button
									title={actionBusy === 'bid' ? 'Bidding…' : 'Bid'}
									variant="secondary"
									disabled={actionBusy !== null}
									onPress={() => void onBid()}
								/>
							</Stack>
						) : null}
					</Stack>
				) : null}

				{active && authenticated && isSeller ? (
					<Button
						title={actionBusy === 'cancel' ? 'Cancelling…' : 'Cancel Listing'}
						variant="danger"
						disabled={actionBusy !== null}
						onPress={() => void onCancel()}
					/>
				) : null}

				{active && !authenticated ? (
					<Pressable accessibilityRole="button">
						<Text tone="primary">Sign in to bid or buy</Text>
					</Pressable>
				) : null}

				{actionError ? <Text tone="danger">{actionError}</Text> : null}
			</Surface>

			<Stack gap="sm">
				<Text variant="subtitle">Bid History</Text>
				{row.bids.length > 0 ? (
					<Stack gap="xs">
						{row.bids.slice(0, 25).map((b, i) => {
							const amount =
								typeof (b as { amount?: number }).amount === 'number'
									? (b as { amount: number }).amount
									: null;
							const placedAt = (b as { placed_at?: string }).placed_at;
							const status = (b as { bid_status?: string }).bid_status;
							return (
								<Stack
									key={i}
									direction="row"
									gap="sm"
									align="center"
									wrap>
									<Text variant="body">
										{amount !== null ? formatKhash(amount) : '—'}
									</Text>
									<Badge label={status ?? 'unknown'} />
									<Text variant="caption" tone="muted">
										{placedAt ? formatRelative(placedAt) : '—'}
									</Text>
								</Stack>
							);
						})}
					</Stack>
				) : (
					<Text tone="muted">No bids yet</Text>
				)}
			</Stack>
		</Stack>
	);
}

const styles = StyleSheet.create({
	icon: { alignItems: 'center' },
	grow: { flexGrow: 1, flexBasis: 200 },
});

export default ListingDetail;
