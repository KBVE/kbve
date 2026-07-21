import { StyleSheet } from 'react-native';
import { Surface, Stack, Text, Badge, tokens } from '../_ui';
import type { RankedRow } from '../adapters/cube';

export interface RankedRowsProps {
	title: string;
	rows: RankedRow[];
	format?: (v: number) => string;
}

export function RankedRows({ title, rows, format }: RankedRowsProps) {
	if (!rows.length) return null;
	const fmt = format ?? ((v: number) => String(v));
	return (
		<Stack gap="xs">
			<Text variant="caption" tone="muted">
				{title}
			</Text>
			{rows.map((r) => (
				<Surface key={r.key} style={styles.row}>
					<Text variant="caption" style={styles.label} numberOfLines={1}>
						{r.label}
					</Text>
					{r.badge ? <Badge label={r.badge} tone="danger" /> : null}
					<Text variant="caption" tone="muted">
						{fmt(r.value)}
					</Text>
				</Surface>
			))}
		</Stack>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.sm,
		padding: tokens.space.sm,
	},
	label: {
		flexGrow: 1,
		flexShrink: 1,
	},
});
