import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { tokens } from '../theme';
import { Text } from '../primitives/Text';
import { Button } from '../primitives/Button';

export interface ErrorStateProps {
	title?: string;
	message?: string;
	retryLabel?: string;
	onRetry?: () => void;
}

export const ErrorState = memo(function ErrorState({
	title = 'Something went wrong',
	message,
	retryLabel = 'Retry',
	onRetry,
}: ErrorStateProps) {
	return (
		<View style={styles.container}>
			<Text variant="subtitle" tone="danger">
				{title}
			</Text>
			{message ? (
				<Text variant="body" tone="muted" style={styles.message}>
					{message}
				</Text>
			) : null}
			{onRetry ? (
				<Button
					title={retryLabel}
					onPress={onRetry}
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
