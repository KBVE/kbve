import { memo, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Stack, Text, tokens } from './_ui';
import { ErrorState } from '../ui/feedback/ErrorState';
import { LoadingState } from '../ui/feedback/LoadingState';
import { VirtualList } from '../ui/lists/VirtualList';
import { StatGrid } from './StatGrid';
import { SectionDivider } from './shared';
import { ControlBar } from './controls/ControlBar';
import { SavedViewTabs } from './controls/SavedViewTabs';
import { useStream, useStreamLifecycle, useStreamSelector } from './useStream';
import type {
	StreamAction,
	StreamFilter,
	StreamLens,
	StreamStore,
} from './types';

const TONE_COLOR: Record<string, string> = {
	primary: tokens.color.primary,
	success: tokens.color.success,
	danger: tokens.color.danger,
	warning: tokens.color.warning,
	neutral: tokens.color.textMuted,
};

type Row =
	| { kind: 'header'; key: string; label: string }
	| { kind: 'item'; key: string; item: unknown; expanded: boolean };

interface RowProps {
	row: Row;
	lens: StreamLens<unknown>;
	layout: 'rows' | 'cards';
	store: StreamStore<unknown>;
	onToggle: (key: string) => void;
}

const StreamRow = memo(
	function StreamRow({ row, lens, layout, store, onToggle }: RowProps) {
		if (row.kind === 'header') {
			return (
				<Text variant="label" tone="muted" style={styles.groupHeader}>
					{row.label}
				</Text>
			);
		}
		const render = layout === 'cards' && lens.card ? lens.card : lens.row;
		return (
			<View>
				<Pressable onPress={() => onToggle(row.key)}>
					{render(row.item, row.expanded)}
				</Pressable>
				{row.expanded && (lens.detail || lens.actions?.length) ? (
					<View style={styles.detail}>
						{lens.detail ? lens.detail(row.item) : null}
						{lens.actions?.length ? (
							<ActionBar
								store={store}
								item={row.item}
								actions={lens.actions}
							/>
						) : null}
					</View>
				) : null}
			</View>
		);
	},
	(a, b) =>
		a.lens === b.lens &&
		a.layout === b.layout &&
		a.store === b.store &&
		a.onToggle === b.onToggle &&
		rowEqual(a.row, b.row),
);

function ActionBar({
	store,
	item,
	actions,
}: {
	store: StreamStore<unknown>;
	item: unknown;
	actions: readonly StreamAction<unknown>[];
}) {
	const busy = useStreamSelector(store, (s) => s.actionBusy);
	const error = useStreamSelector(store, (s) => s.actionError);
	const msg = useStreamSelector(store, (s) => s.actionMsg);
	const [armed, setArmed] = useState<string | null>(null);
	const anyBusy = busy !== null;
	const id = store.id(item);

	return (
		<Stack gap="sm" style={styles.actionBar}>
			<Stack direction="row" gap="sm" wrap>
				{actions.map((a) => {
					const key = `${id}:${a.id}`;
					const thisBusy = busy === key;
					const needsConfirm = a.destructive && armed !== a.id;
					const tone = a.destructive
						? tokens.color.danger
						: tokens.color.primary;
					return (
						<Pressable
							key={a.id}
							disabled={anyBusy}
							onPress={() => {
								if (needsConfirm) {
									setArmed(a.id);
									return;
								}
								setArmed(null);
								void store.runAction(key, () => a.run(item), {
									successMsg: `${a.label} triggered`,
								});
							}}
							style={[
								styles.actionBtn,
								{ borderColor: tone },
								anyBusy ? styles.actionDisabled : null,
							]}>
							<Text
								variant="caption"
								weight="medium"
								style={{ color: tone }}>
								{thisBusy
									? '…'
									: needsConfirm
										? `Confirm ${a.label}?`
										: a.label}
							</Text>
						</Pressable>
					);
				})}
			</Stack>
			{error || msg ? (
				<Text variant="caption" tone={error ? 'danger' : 'success'}>
					{error ?? msg}
				</Text>
			) : null}
		</Stack>
	);
}

// Compare row CONTENT, not the wrapper identity — buildRows produces fresh
// wrappers each poll, but a reconciled item keeps its ref, so this lets an
// unchanged row skip re-render while only flipped/expanded rows update.
function rowEqual(a: Row, b: Row): boolean {
	if (a.kind !== b.kind || a.key !== b.key) return false;
	if (a.kind === 'item' && b.kind === 'item') {
		return a.item === b.item && a.expanded === b.expanded;
	}
	if (a.kind === 'header' && b.kind === 'header') {
		return a.label === b.label;
	}
	return false;
}

function FilterChips({
	filters,
	active,
	onPick,
}: {
	filters: readonly StreamFilter<unknown>[];
	active: string | null;
	onPick: (id: string | null) => void;
}) {
	return (
		<Stack direction="row" gap="sm" wrap>
			{filters.map((f) => {
				const on = active === f.id;
				const tone =
					TONE_COLOR[f.tone ?? 'primary'] ?? tokens.color.primary;
				return (
					<Pressable
						key={f.id}
						onPress={() => onPick(on ? null : f.id)}
						style={[
							styles.chip,
							{ borderColor: tone },
							on ? { backgroundColor: tone } : null,
						]}>
						<Text
							variant="caption"
							weight="medium"
							style={{
								color: on ? tokens.color.onPrimary : tone,
							}}>
							{f.label}
						</Text>
					</Pressable>
				);
			})}
		</Stack>
	);
}

export interface StreamViewProps<TItem> {
	store: StreamStore<TItem>;
	lens: StreamLens<TItem>;
	layout?: 'rows' | 'cards';
	searchPlaceholder?: string;
}

export function StreamView<TItem>({
	store,
	lens,
	layout = 'rows',
	searchPlaceholder = 'Filter…',
}: StreamViewProps<TItem>): ReactElement {
	useStreamLifecycle(store);
	const state = useStream(store);

	const pickFilter = (id: string | null) => {
		const prev = lens.filters?.find((f) => f.id === state.filterId);
		const next = lens.filters?.find((f) => f.id === id);
		store.setFilter(id);
		const patch: Record<string, string | number | undefined> = {};
		if (prev?.params)
			for (const k of Object.keys(prev.params)) patch[k] = undefined;
		if (next?.params) Object.assign(patch, next.params);
		if (Object.keys(patch).length) store.setParams(patch);
	};

	const visible = useMemo(() => {
		const q = state.search.trim().toLowerCase();
		const filter = lens.filters?.find((f) => f.id === state.filterId);
		let items = state.items;
		if (filter) items = items.filter(filter.predicate);
		if (q && lens.searchText) {
			const searchFn = lens.searchText;
			items = items.filter((it) =>
				searchFn(it).toLowerCase().includes(q),
			);
		}
		return items;
	}, [state.items, state.search, state.filterId, lens]);

	const rows = useMemo(
		() => buildRows(visible, state.expandedId, state.groupKey, store, lens),
		[visible, state.expandedId, state.groupKey, store, lens],
	);

	if (state.loading && state.items.length === 0) {
		return <LoadingState label="Loading…" />;
	}
	if (state.error && state.items.length === 0) {
		return (
			<ErrorState
				message={state.error}
				onRetry={() => void store.refresh()}
			/>
		);
	}

	const stats = lens.stats?.(state.items, state.meta) ?? [];
	const lensU = lens as unknown as StreamLens<unknown>;
	const storeU = store as unknown as StreamStore<unknown>;

	return (
		<Stack gap="md">
			{stats.length ? (
				<>
					<SectionDivider label="Summary" />
					<StatGrid stats={stats} />
				</>
			) : null}
			{lens.metaPanel ? lens.metaPanel(state.meta) : null}

			{state.views.length || lens.controls?.length ? (
				<SectionDivider label="Query" />
			) : null}
			{state.views.length ? (
				<SavedViewTabs
					store={storeU}
					views={state.views}
					activeViewId={state.activeViewId}
				/>
			) : null}
			{lens.controls?.length ? (
				<ControlBar
					store={storeU}
					controls={lens.controls}
					params={state.params}
					meta={state.meta}
				/>
			) : null}

			<SectionDivider label="Feed" />
			<Stack direction="row" gap="sm" align="center" wrap>
				{lens.filters?.length ? (
					<FilterChips
						filters={
							lens.filters as readonly StreamFilter<unknown>[]
						}
						active={state.filterId}
						onPick={pickFilter}
					/>
				) : null}
				{lens.searchText ? (
					<TextInput
						value={state.search}
						onChangeText={store.setSearch}
						placeholder={searchPlaceholder}
						placeholderTextColor={tokens.color.textFaint}
						style={styles.search}
					/>
				) : null}
				<Pressable
					onPress={() => void store.refresh()}
					style={styles.refresh}>
					<Text variant="caption" tone="muted">
						↻ Refresh
					</Text>
				</Pressable>
			</Stack>

			<VirtualList
				data={rows}
				keyExtractor={(r) => r.key}
				extraData={`${state.expandedId}:${state.groupKey}`}
				renderItem={({ item }) => (
					<StreamRow
						row={item}
						lens={lensU}
						layout={layout}
						store={storeU}
						onToggle={store.toggleExpanded}
					/>
				)}
				ItemSeparatorComponent={Separator}
				ListEmptyComponent={EmptyRow}
			/>
		</Stack>
	);
}

function buildRows<TItem>(
	items: TItem[],
	expandedId: string | null,
	groupKey: string | null,
	store: StreamStore<TItem>,
	lens: StreamLens<TItem>,
): Row[] {
	if (!groupKey || !lens.group) {
		return items.map((it) => {
			const key = store.id(it);
			return {
				kind: 'item',
				key,
				item: it,
				expanded: expandedId === key,
			};
		});
	}

	const buckets = new Map<string, TItem[]>();
	for (const it of items) {
		const g = lens.group(it) || '—';
		const arr = buckets.get(g) ?? [];
		arr.push(it);
		buckets.set(g, arr);
	}
	const out: Row[] = [];
	for (const [label, bucket] of [...buckets.entries()].sort((a, b) =>
		a[0].localeCompare(b[0]),
	)) {
		out.push({ kind: 'header', key: `h:${label}`, label });
		for (const it of bucket) {
			const key = store.id(it);
			out.push({
				kind: 'item',
				key,
				item: it,
				expanded: expandedId === key,
			});
		}
	}
	return out;
}

function Separator() {
	return <View style={styles.separator} />;
}

function EmptyRow() {
	return (
		<Text variant="caption" tone="muted" style={styles.empty}>
			Nothing matches the current filter
		</Text>
	);
}

const styles = StyleSheet.create({
	groupHeader: {
		marginTop: tokens.space.sm,
		textTransform: 'uppercase',
		letterSpacing: 0.5,
	},
	detail: {
		marginTop: tokens.space.xs,
		padding: tokens.space.md,
		backgroundColor: tokens.color.surfaceAlt,
		borderRadius: tokens.radius.lg,
		borderWidth: 1,
		borderColor: tokens.color.border,
	},
	chip: {
		paddingHorizontal: tokens.space.md,
		paddingVertical: 4,
		borderRadius: tokens.radius.pill,
		borderWidth: 1,
	},
	refresh: {
		paddingHorizontal: tokens.space.md,
		paddingVertical: 4,
		borderRadius: tokens.radius.pill,
		borderWidth: 1,
		borderColor: tokens.color.border,
	},
	search: {
		flexGrow: 1,
		minWidth: 160,
		paddingHorizontal: tokens.space.md,
		paddingVertical: 6,
		color: tokens.color.text,
		backgroundColor: tokens.color.surface,
		borderRadius: tokens.radius.md,
		borderWidth: 1,
		borderColor: tokens.color.border,
	},
	separator: { height: tokens.space.sm },
	empty: { padding: tokens.space.lg, textAlign: 'center' },
	actionBar: {
		marginTop: tokens.space.sm,
		paddingTop: tokens.space.sm,
		borderTopWidth: 1,
		borderTopColor: tokens.color.border,
	},
	actionBtn: {
		paddingHorizontal: tokens.space.md,
		paddingVertical: 6,
		borderRadius: tokens.radius.md,
		borderWidth: 1,
	},
	actionDisabled: { opacity: 0.4 },
});
