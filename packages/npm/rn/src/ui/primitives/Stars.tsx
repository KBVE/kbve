import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../ThemeProvider';
import { Text } from './Text';

export interface StarsProps {
	value: number;
	count?: number;
	max?: number;
}

export const Stars = memo(function Stars({
	value,
	count,
	max = 5,
}: StarsProps) {
	const t = useTheme();
	const full = Math.round(value);
	const empty = Math.max(0, max - full);
	return (
		<View style={styles.row}>
			<Text style={{ color: t.color.warning }}>{'★'.repeat(full)}</Text>
			{empty > 0 ? (
				<Text style={{ color: t.color.textFaint }}>
					{'★'.repeat(empty)}
				</Text>
			) : null}
			<Text variant="caption" tone="muted" style={styles.label}>
				{value.toFixed(1)}
				{count !== undefined ? ` (${count})` : ''}
			</Text>
		</View>
	);
});

const styles = StyleSheet.create({
	row: { flexDirection: 'row', alignItems: 'center' },
	label: { marginLeft: 4 },
});
