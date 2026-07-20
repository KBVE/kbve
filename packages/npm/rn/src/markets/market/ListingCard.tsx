import { Pressable, StyleSheet, View } from 'react-native';
import { Stack } from '../../ui/primitives/Stack';
import { Surface } from '../../ui/primitives/Surface';
import { Text } from '../../ui/primitives/Text';
import { tokens } from '../../ui/theme';
import { useCountdown, formatCountdown } from './countdown';
import { EnchantList } from './EnchantList';
import { ItemIcon } from './ItemIcon';
import { WatchToggle } from './WatchToggle';
import { formatKhash, itemRefLabel } from './format';
import type { MarketListing } from './types';

export interface ListingCardProps {
	row: MarketListing;
	onOpen: (listingId: number) => void;
}

export function ListingCard({ row, onOpen }: ListingCardProps) {
	const countdown = useCountdown(row.expires_at);
	const urgent = countdown.totalMs < 60 * 60 * 1000;
	const refObj = (row.item_ref ?? {}) as { kind?: unknown; id?: unknown };
	const refKind = typeof refObj.kind === 'string' ? refObj.kind : '';
	const refId =
		typeof refObj.id === 'string' || typeof refObj.id === 'number'
			? String(refObj.id)
			: '';
	return (
		<View style={styles.card}>
			<Pressable
				onPress={() => onOpen(row.listing_id)}
				accessibilityRole="button">
				<Surface style={styles.surface}>
					<View style={styles.icon}>
						<ItemIcon itemRef={row.item_ref} size={96} />
					</View>
					<Stack gap="xs">
						<Stack direction="row" gap="xs" align="center" wrap>
							<Text variant="subtitle">{itemRefLabel(row.item_ref)}</Text>
							<EnchantList itemRef={row.item_ref} compact />
						</Stack>
						<Stack direction="row" gap="md">
							{row.buy_now_price !== null ? (
								<Stack gap="xs">
									<Text variant="caption" tone="muted">
										Buy
									</Text>
									<Text variant="body" weight="medium">
										{formatKhash(row.buy_now_price)}
									</Text>
								</Stack>
							) : null}
							{row.current_bid !== null || row.min_bid !== null ? (
								<Stack gap="xs">
									<Text variant="caption" tone="muted">
										{row.current_bid !== null ? 'Bid' : 'Min'}
									</Text>
									<Text variant="body" weight="medium">
										{formatKhash(row.current_bid ?? row.min_bid)}
									</Text>
								</Stack>
							) : null}
						</Stack>
						<Text variant="caption" tone={urgent ? 'danger' : 'muted'}>
							{formatCountdown(countdown)}
						</Text>
					</Stack>
				</Surface>
			</Pressable>
			{refKind && refId ? (
				<View style={styles.watch}>
					<WatchToggle kind={refKind} itemRef={refId} size="sm" />
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	card: { flexGrow: 1, flexBasis: 220, maxWidth: '100%', position: 'relative' },
	surface: { position: 'relative' },
	watch: { position: 'absolute', top: tokens.space.sm, right: tokens.space.sm },
	icon: { alignItems: 'center', marginBottom: tokens.space.sm },
});
