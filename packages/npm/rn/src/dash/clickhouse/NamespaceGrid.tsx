import { Pressable, StyleSheet } from 'react-native';
import { Surface, Stack, Text, Badge, tokens } from '../_ui';
import type { StreamStore } from '../types';
import type { LogItem } from './logItem';
import { buildNamespaceRollup, CLUSTER_NS_LABEL } from './chRollup';

export function makeNamespaceGrid(store: StreamStore<LogItem>) {
	return function NamespaceGrid(meta: unknown, selectedNs: string) {
		const rows = buildNamespaceRollup(meta);
		if (!rows.length) return null;
		return (
			<Stack gap="xs">
				{rows.map((r) => {
					const selectable = r.namespace !== CLUSTER_NS_LABEL;
					const on = selectable && r.namespace === selectedNs;
					const body = (
						<Surface
							style={[
								styles.row,
								on ? styles.rowOn : null,
								selectable ? null : styles.rowInert,
							]}>
							<Text
								variant="caption"
								weight={on ? 'medium' : undefined}
								style={styles.name}>
								{r.namespace}
							</Text>
							{r.errors ? (
								<Badge
									label={`${r.errors} err`}
									tone="danger"
								/>
							) : null}
							{r.warns ? (
								<Badge
									label={`${r.warns} warn`}
									tone="warning"
								/>
							) : null}
							<Text variant="caption" tone="muted">
								{r.total}
							</Text>
						</Surface>
					);
					if (!selectable)
						return <Stack key={r.namespace}>{body}</Stack>;
					return (
						<Pressable
							key={r.namespace}
							onPress={() =>
								store.setParams({
									pod_namespace: on ? undefined : r.namespace,
								})
							}>
							{body}
						</Pressable>
					);
				})}
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
	rowOn: {
		borderWidth: 1,
		borderColor: tokens.color.primary,
	},
	rowInert: { opacity: 0.55 },
	name: { flexGrow: 1 },
});
