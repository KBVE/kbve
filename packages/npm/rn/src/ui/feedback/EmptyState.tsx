import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { tokens } from '../theme';
import { Text } from '../primitives/Text';
import { Button } from '../primitives/Button';

export interface EmptyStateProps {
	title: string;
	message?: string;
	actionLabel?: string;
	onAction?: () => void;
}

export const EmptyState = memo(function EmptyState({
	title,
	message,
	actionLabel,
	onAction,
}: EmptyStateProps) {
	return (
		<View style={styles.container}>
			<Text variant="subtitle">{title}</Text>
			{message ? (
				<Text variant="body" tone="muted" style={styles.message}>
					{message}
				</Text>
			) : null}
			{actionLabel && onAction ? (
				<Button
					title={actionLabel}
					onPress={onAction}
					style={styles.action}
				/>
			) : null}
		</View>
	);
});

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		padding: tokens.space.xl,
		gap: tokens.space.sm,
	},
	message: { textAlign: 'center' },
	action: { marginTop: tokens.space.md, alignSelf: 'stretch' },
});
