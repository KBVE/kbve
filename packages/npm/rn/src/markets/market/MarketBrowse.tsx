import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '../../ui/primitives/Button';
import { Stack } from '../../ui/primitives/Stack';
import { Text } from '../../ui/primitives/Text';
import { tokens } from '../../ui/theme';
import { Select } from '../../ui/controls/Select';
import type { SelectOption } from '../../ui/controls/Select.types';
import type { MarketApi } from './api';
import { MarketApiError } from './errors';
import { ListingCard } from './ListingCard';
import type { MarketListing } from './types';

const PAGE_SIZE = 25;

const KIND_FILTERS: SelectOption[] = [
	{ value: 'all', label: 'All kinds' },
	{ value: 'mc_item', label: 'Minecraft' },
	{ value: 'rareicon_item', label: 'Rareicon' },
	{ value: 'generic', label: 'Other' },
];

export interface MarketBrowseProps {
	api: MarketApi;
	onOpen: (listingId: number) => void;
}

export function MarketBrowse({ api, onOpen }: MarketBrowseProps) {
	const [rows, setRows] = useState<MarketListing[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [hasMore, setHasMore] = useState(false);
	const [kindFilter, setKindFilter] = useState<string>('all');

	const load = useCallback(
		async (after?: MarketListing) => {
			setLoading(true);
			setError(null);
			try {
				const page = await api.listActive({
					limit: PAGE_SIZE,
					before_created_at: after?.created_at ?? null,
					before_id: after?.listing_id ?? null,
				});
				setRows((prev) => (after ? [...prev, ...page] : page));
				setHasMore(page.length === PAGE_SIZE);
			} catch (e) {
				setError(
					e instanceof MarketApiError
						? e.message
						: 'failed to load listings',
				);
			} finally {
				setLoading(false);
			}
		},
		[api],
	);

	useEffect(() => {
		void load();
	}, [load]);

	const loadMore = () => {
		const tail = rows[rows.length - 1];
		if (tail) void load(tail);
	};

	const filtered = useMemo(() => {
		if (kindFilter === 'all') return rows;
		return rows.filter((r) => {
			const k = (r.item_ref as { kind?: unknown })?.kind;
			return typeof k === 'string' ? k === kindFilter : kindFilter === 'generic';
		});
	}, [rows, kindFilter]);

	return (
		<Stack gap="lg">
			<Stack direction="row" align="center" gap="md" wrap>
				<Select
					value={kindFilter}
					options={KIND_FILTERS}
					onValueChange={setKindFilter}
				/>
				<Text variant="caption" tone="muted">
					{filtered.length} / {rows.length} shown
				</Text>
				<Button
					title={loading ? '…' : '↻ Refresh'}
					variant="secondary"
					disabled={loading}
					onPress={() => void load()}
				/>
			</Stack>

			{loading && rows.length === 0 ? (
				<Text variant="body" tone="muted">
					Loading listings…
				</Text>
			) : null}
			{error && rows.length === 0 ? (
				<Text variant="body" tone="danger">
					{error}
				</Text>
			) : null}
			{!loading && rows.length === 0 && !error ? (
				<Text variant="body" tone="muted">
					No active listings yet. Check back soon.
				</Text>
			) : null}

			{filtered.length > 0 ? (
				<View style={styles.grid}>
					{filtered.map((r) => (
						<ListingCard key={r.listing_id} row={r} onOpen={onOpen} />
					))}
				</View>
			) : null}

			{rows.length > 0 && filtered.length === 0 ? (
				<Text variant="body" tone="muted">
					No active listings match this filter.
				</Text>
			) : null}

			{hasMore ? (
				<Button
					title={loading ? 'Loading…' : 'Load more'}
					variant="outline"
					disabled={loading}
					onPress={loadMore}
				/>
			) : null}
			{error && rows.length > 0 ? (
				<Text variant="body" tone="danger">
					{error}
				</Text>
			) : null}
		</Stack>
	);
}

const styles = StyleSheet.create({
	grid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.md },
});

export default MarketBrowse;
