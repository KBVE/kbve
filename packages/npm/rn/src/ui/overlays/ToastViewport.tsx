import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { tokens } from '../theme';
import { Text } from '../primitives/Text';
import { useToasts, toasts } from '../../toasts';
import type { Toast } from '../../toasts';

const MAX_VISIBLE = 3;

const ToastRow = memo(function ToastRow({ model }: { model: Toast }) {
	return (
		<Pressable
			style={[styles.toast, toneStyle[model.tone ?? 'neutral']]}
			onPress={() => toasts.dismiss(model.id)}>
			<Text variant="label" style={styles.text}>
				{model.message}
			</Text>
			{model.action ? (
				<Pressable
					hitSlop={8}
					onPress={() => {
						model.action?.onPress();
						toasts.dismiss(model.id);
					}}>
					<Text variant="label" style={styles.action}>
						{model.action.label}
					</Text>
				</Pressable>
			) : null}
		</Pressable>
	);
});

export function ToastViewport() {
	const queue = useToasts();
	const visible = queue.slice(0, MAX_VISIBLE);
	return (
		<View pointerEvents="box-none" style={styles.viewport}>
			{visible.map((toast) => (
				<ToastRow key={toast.id} model={toast} />
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
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: tokens.space.md,
		paddingVertical: tokens.space.md,
		paddingHorizontal: tokens.space.lg,
		borderRadius: tokens.radius.md,
		borderWidth: 1,
	},
	text: { color: '#fff', flexShrink: 1 },
	action: { color: '#fff', fontWeight: '700', textTransform: 'uppercase' },
});

const toneStyle = StyleSheet.create({
	neutral: {
		backgroundColor: tokens.color.surfaceAlt,
		borderColor: tokens.color.border,
	},
	success: { backgroundColor: '#0e2a1a', borderColor: tokens.color.success },
	danger: { backgroundColor: '#2a0e12', borderColor: tokens.color.danger },
	warning: { backgroundColor: '#2a210e', borderColor: tokens.color.warning },
	info: { backgroundColor: '#0e1f2a', borderColor: '#3b82f6' },
});
