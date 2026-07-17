import { StyleSheet, View } from 'react-native';
import { Badge, Stack, Surface, Text, tokens } from '../_ui';
import type { StreamLens, StreamStore } from '../types';
import { createMcStream } from '../mc/mcStream';
import type { McServerItem, McStreamOptions } from '../mc/mcStream';
import { serverMeta } from '../mc/labels';

export function createMinecraftStream(
	opts: McStreamOptions = {},
): StreamStore<McServerItem> {
	return createMcStream(opts);
}

function dotColor(reachable: boolean): string {
	return reachable ? tokens.color.success : tokens.color.textFaint;
}

export const minecraftLens: StreamLens<McServerItem> = {
	searchText: (it) =>
		`${it.name} ${serverMeta(it.name).label} ${it.players
			.map((p) => p.name)
			.join(' ')}`,
	group: (it) => (it.reachable ? 'Online' : 'Unreachable'),
	filters: [
		{
			id: 'online',
			label: 'Online',
			tone: 'success',
			predicate: (it) => it.reachable,
		},
		{
			id: 'offline',
			label: 'Unreachable',
			tone: 'neutral',
			predicate: (it) => !it.reachable,
		},
		{
			id: 'with_players',
			label: 'With Players',
			tone: 'success',
			predicate: (it) => it.players.length > 0,
		},
	],
	stats: (items) => [
		{ id: 'total', label: 'Servers', value: items.length },
		{
			id: 'online',
			label: 'Online',
			tone: 'success',
			value: items.filter((i) => i.reachable).length,
		},
		{
			id: 'players',
			label: 'Players',
			tone: 'success',
			value: items.reduce((sum, i) => sum + i.online, 0),
		},
	],
	row: (it) => (
		<Surface padded={false} style={styles.row}>
			<View
				style={[styles.dot, { backgroundColor: dotColor(it.reachable) }]}
			/>
			<Stack gap="xs" style={styles.rowContent}>
				<Stack direction="row" align="center" gap="xs" wrap>
					<Text variant="label" numberOfLines={1} style={styles.name}>
						{serverMeta(it.name).label}
					</Text>
					<Badge
						label={it.reachable ? 'ONLINE' : 'UNREACHABLE'}
						tone={it.reachable ? 'success' : 'neutral'}
					/>
					<Badge label={`${it.online}/${it.max}`} tone="neutral" />
				</Stack>
				{it.players.length > 0 && (
					<Text variant="caption" tone="muted" numberOfLines={1}>
						{it.players.map((p) => p.name).join(', ')}
					</Text>
				)}
			</Stack>
		</Surface>
	),
	detail: (it) => (
		<Stack gap="xs">
			<Fact label="Server" value={it.name} />
			<Fact
				label="Status"
				value={it.reachable ? 'ONLINE' : 'UNREACHABLE'}
			/>
			<Fact label="Players" value={`${it.online} / ${it.max}`} />
			<Fact
				label="Cached"
				value={new Date(it.cachedAt * 1000).toLocaleTimeString()}
			/>
		</Stack>
	),
};

function Fact({ label, value }: { label: string; value: string }) {
	return (
		<Stack direction="row" gap="sm" justify="space-between">
			<Text variant="caption" tone="muted">
				{label}
			</Text>
			<Text variant="caption" numberOfLines={1} style={styles.factValue}>
				{value}
			</Text>
		</Stack>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.sm,
		paddingHorizontal: tokens.space.md,
		paddingVertical: tokens.space.sm,
	},
	rowContent: { flexShrink: 1, flexGrow: 1 },
	dot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
	name: { flexShrink: 1 },
	factValue: { flexShrink: 1, textAlign: 'right' },
});
