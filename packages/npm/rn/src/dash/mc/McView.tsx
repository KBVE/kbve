import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Stack, Text, tokens } from '../_ui';
import { StatGrid } from '../StatGrid';
import { formatAgo } from '../shared';
import { useStream, useStreamLifecycle } from '../useStream';
import { createMcStream } from './mcStream';
import { createRconExec } from './rconExec';
import { ServerCard } from './ServerCard';

export interface McViewProps {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
}

export function McView({ getToken, baseUrl = '' }: McViewProps) {
	const store = useMemo(() => createMcStream({ baseUrl }), [baseUrl]);
	const exec = useMemo(
		() => createRconExec({ getToken, baseUrl }),
		[getToken, baseUrl],
	);
	useStreamLifecycle(store);
	const state = useStream(store);

	const stats = [
		{ id: 'servers', label: 'Servers', value: state.items.length },
		{
			id: 'online',
			label: 'Online',
			tone: 'success' as const,
			value: state.items.filter((i) => i.reachable).length,
		},
		{
			id: 'players',
			label: 'Players',
			tone: 'success' as const,
			value: state.items.reduce((sum, i) => sum + i.online, 0),
		},
	];

	return (
		<Stack gap="md">
			<Stack direction="row" justify="space-between" align="center">
				<Text variant="subtitle">Minecraft Gameops</Text>
				<Pressable onPress={() => void store.refresh()}>
					<Text variant="caption" tone="muted">
						{state.lastUpdated
							? `updated ${formatAgo(new Date(state.lastUpdated))}`
							: 'refresh'}
					</Text>
				</Pressable>
			</Stack>
			{state.error && state.items.length === 0 ? (
				<Text variant="caption" tone="muted">
					MC status unavailable — {state.error}
				</Text>
			) : (
				<>
					<StatGrid stats={stats} />
					<View style={styles.grid}>
						{state.items.map((item) => (
							<View key={item.id} style={styles.cell}>
								<ServerCard item={item} exec={exec} />
							</View>
						))}
					</View>
				</>
			)}
		</Stack>
	);
}

const styles = StyleSheet.create({
	grid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: tokens.space.md,
	},
	cell: { flexGrow: 1, flexBasis: 340, maxWidth: '100%' },
});
