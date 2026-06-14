import { memo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { tokens } from '../theme';
import { Text } from '../primitives/Text';

export const LoadingState = memo(function LoadingState({
	label,
}: {
	label?: string;
}) {
	return (
		<View style={styles.container}>
			<ActivityIndicator color={tokens.color.primary} />
			{label ? (
				<Text variant="caption" tone="muted">
					{label}
				</Text>
			) : null}
		</View>
	);
});

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		gap: tokens.space.sm,
	},
});
