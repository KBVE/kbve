import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { tokens } from '../theme';
import { Surface } from '../primitives/Surface';
import { Text } from '../primitives/Text';
import { Button } from '../primitives/Button';
import { overlayStore } from '../state/overlayStore';
import type { OverlayDescriptor } from '../state/overlayStore';

type ConfirmModel = Extract<OverlayDescriptor, { type: 'confirm' }>;

export const ConfirmationDialog = memo(function ConfirmationDialog({
	model,
}: {
	model: ConfirmModel;
}) {
	const confirm = () => {
		overlayStore.hide();
		model.onConfirm();
	};
	return (
		<Surface style={styles.dialog}>
			<Text variant="subtitle">{model.title}</Text>
			<Text variant="body" tone="muted" style={styles.message}>
				{model.message}
			</Text>
			<View style={styles.actions}>
				<Button
					title={model.cancelLabel ?? 'Cancel'}
					variant="ghost"
					onPress={overlayStore.hide}
					style={styles.action}
				/>
				<Button
					title={model.confirmLabel ?? 'Confirm'}
					variant={model.destructive ? 'danger' : 'primary'}
					onPress={confirm}
					style={styles.action}
				/>
			</View>
		</Surface>
	);
});

const styles = StyleSheet.create({
	dialog: { gap: tokens.space.sm },
	message: { marginBottom: tokens.space.sm },
	actions: { flexDirection: 'row', gap: tokens.space.sm },
	action: { flex: 1 },
});
