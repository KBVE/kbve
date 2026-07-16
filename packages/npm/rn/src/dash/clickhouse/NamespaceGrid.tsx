import { Pressable, StyleSheet } from 'react-native';
import { Surface, Stack, Text, Badge, tokens } from '../_ui';
import type { StreamStore } from '../types';
import type { LogItem } from '../adapters/clickhouse';
import { buildNamespaceRollup } from './chRollup';

export function makeNamespaceGrid(store: StreamStore<LogItem>) {
	return function NamespaceGrid(meta: unknown) {
		const rows = buildNamespaceRollup(meta);
		if (!rows.length) return null;
		return (
			<Stack gap="xs">
				{rows.map((r) => (
					<Pressable
						key={r.namespace}
						onPress={() =>
							store.setParams({
								pod_namespace: r.namespace === '(cluster)' ? undefined : r.namespace,
							})
						}
					>
						<Surface style={styles.row}>
							<Text variant="caption" style={{ flexGrow: 1 }}>
								{r.namespace}
							</Text>
							{r.errors ? <Badge label={`${r.errors} err`} tone="danger" /> : null}
							{r.warns ? <Badge label={`${r.warns} warn`} tone="warning" /> : null}
							<Text variant="caption" tone="muted">
								{r.total}
							</Text>
						</Surface>
					</Pressable>
				))}
			</Stack>
		);
	};
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.sm,
		padding: tokens.space.sm,
	},
});
