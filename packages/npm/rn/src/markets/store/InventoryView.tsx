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
import type { InventoryItem } from './types';

export interface InventoryViewProps {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
	authenticated: boolean;
}

function displayName(item: InventoryItem): string {
	const title = item.nbt?.title;
	return typeof title === 'string' && title.length > 0 ? title : item.ref;
}

function kindLabel(kind: string): string {
	return kind.replace(/_/g, ' ');
}

function when(iso: string): string {
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

function ItemCard({ item }: { item: InventoryItem }) {
	const escrowed = item.state === 'listing_escrow';
	return (
		<Surface>
			<Stack gap="xs">
				<Stack direction="row" justify="space-between" align="center">
					<Text variant="subtitle">{displayName(item)}</Text>
					{escrowed ? (
						<Badge tone="warning" label="listed" />
					) : (
						<Badge tone="success" label="held" />
					)}
				</Stack>
				<Text variant="caption" tone="muted">
					{kindLabel(item.kind)}
					{item.qty > 1 ? ` · ×${item.qty}` : ''}
				</Text>
				{escrowed ? (
					<Text variant="caption" tone="warning">
						In marketplace escrow while the listing is live.
					</Text>
				) : null}
				<Text variant="caption" tone="faint">
					{`Acquired ${when(item.created_at)}`}
				</Text>
			</Stack>
		</Surface>
	);
}

export function InventoryView({
	getToken,
	baseUrl = '',
	authenticated,
}: InventoryViewProps) {
	const api = useMemo(
		() => createStoreApi({ getToken, baseUrl }),
		[getToken, baseUrl],
	);
	const [items, setItems] = useState<InventoryItem[]>([]);
	const [loaded, setLoaded] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		if (!authenticated) {
			setLoaded(true);
			return;
		}
		try {
			setItems(await api.myInventory());
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

	const escrowed = items.filter((i) => i.state === 'listing_escrow').length;

	if (!authenticated) {
		return (
			<EmptyState
				title="Sign in to see your inventory"
				message="Everything you own — store drops, market pickups, grants — shows up here."
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

	if (items.length === 0) {
		return (
			<EmptyState
				title="Nothing owned yet"
				message="Buy a drop in the store and it lands here the moment it mints."
			/>
		);
	}

	return (
		<Stack gap="md">
			<Stack direction="row" gap="md" wrap>
				<View style={styles.stat}>
					<Text variant="title">{items.length}</Text>
					<Text variant="caption" tone="muted">
						{items.length === 1 ? 'item owned' : 'items owned'}
					</Text>
				</View>
				{escrowed > 0 ? (
					<View style={styles.stat}>
						<Text variant="title">{escrowed}</Text>
						<Text variant="caption" tone="muted">
							listed on the market
						</Text>
					</View>
				) : null}
			</Stack>
			<View style={styles.grid}>
				{items.map((item) => (
					<View key={item.item_id} style={styles.cell}>
						<ItemCard item={item} />
					</View>
				))}
			</View>
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
	grid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.md },
	cell: { flexGrow: 1, flexBasis: 260, maxWidth: '100%' },
});

export default InventoryView;
