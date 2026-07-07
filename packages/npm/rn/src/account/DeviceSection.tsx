import { View, StyleSheet } from 'react-native';
import { Surface } from '../ui/primitives/Surface';
import { Stack } from '../ui/primitives/Stack';
import { Text } from '../ui/primitives/Text';
import { tokens } from '../ui/theme';
import { useDeviceInfo } from './useDeviceInfo';

export function DeviceSection() {
	const { data, loading } = useDeviceInfo();

	return (
		<Surface>
			<Stack gap="md">
				<Text variant="label">Device</Text>
				{loading || !data ? (
					<Text tone="muted">Loading…</Text>
				) : (
					<Stack gap="sm">
						{data.rows.map((row) => (
							<View key={row.label} style={styles.row}>
								<Text tone="muted">{row.label}</Text>
								<Text>{row.value}</Text>
							</View>
						))}
					</Stack>
				)}
			</Stack>
		</Surface>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		gap: tokens.space.md,
	},
});
