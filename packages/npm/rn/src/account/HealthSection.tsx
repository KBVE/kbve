import { View, StyleSheet } from 'react-native';
import { Surface } from '../ui/primitives/Surface';
import { Stack } from '../ui/primitives/Stack';
import { Text } from '../ui/primitives/Text';
import { Button } from '../ui/primitives/Button';
import { tokens } from '../ui/theme';
import type { HealthStatus } from './types';
import { useHealthInfo } from './useHealthInfo';

const DOT: Record<HealthStatus, string> = {
	ok: tokens.color.success,
	unavailable: tokens.color.textFaint,
	checking: tokens.color.primary,
	error: tokens.color.danger,
};

export function HealthSection() {
	const { data, loading, refresh } = useHealthInfo();

	return (
		<Surface>
			<Stack gap="md">
				<Stack direction="row" justify="space-between" align="center">
					<Text variant="label">System Health</Text>
					<Button variant="ghost" title="Refresh" onPress={refresh} />
				</Stack>
				{loading || !data ? (
					<Text tone="muted">Checking…</Text>
				) : (
					<Stack gap="sm">
						{data.map((check) => (
							<View key={check.label} style={styles.row}>
								<Stack direction="row" gap="sm" align="center">
									<View
										style={[
											styles.dot,
											{
												backgroundColor:
													DOT[check.status],
											},
										]}
									/>
									<Text tone="muted">{check.label}</Text>
								</Stack>
								<Text>{check.detail ?? check.status}</Text>
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
		alignItems: 'center',
		gap: tokens.space.md,
	},
	dot: { width: 8, height: 8, borderRadius: 4 },
});
