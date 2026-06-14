import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { tokens } from '../theme';
import { Text } from '../primitives/Text';
import { useToasts, toastStore } from '../state/toastStore';
import type { ToastModel } from '../state/toastStore';

const MAX_VISIBLE = 3;

const Toast = memo(function Toast({ model }: { model: ToastModel }) {
	return (
		<Pressable
			style={[styles.toast, toneStyle[model.tone ?? 'neutral']]}
			onPress={() => toastStore.dismiss(model.id)}>
			<Text variant="label" style={styles.text}>
				{model.message}
			</Text>
		</Pressable>
	);
});

export function ToastViewport() {
	const queue = useToasts();
	const visible = queue.slice(0, MAX_VISIBLE);
	return (
		<View pointerEvents="box-none" style={styles.viewport}>
			{visible.map((toast) => (
				<Toast key={toast.id} model={toast} />
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	viewport: {
		position: 'absolute',
		left: tokens.space.lg,
		right: tokens.space.lg,
		bottom: tokens.space.xl,
		gap: tokens.space.sm,
	},
	toast: {
		paddingVertical: tokens.space.md,
		paddingHorizontal: tokens.space.lg,
		borderRadius: tokens.radius.md,
		borderWidth: 1,
	},
	text: { color: '#fff' },
});

const toneStyle = StyleSheet.create({
	neutral: {
		backgroundColor: tokens.color.surfaceAlt,
		borderColor: tokens.color.border,
	},
	success: { backgroundColor: '#0e2a1a', borderColor: tokens.color.success },
	danger: { backgroundColor: '#2a0e12', borderColor: tokens.color.danger },
	warning: { backgroundColor: '#2a210e', borderColor: tokens.color.warning },
});
