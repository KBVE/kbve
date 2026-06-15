import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { tokens } from '../theme';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
	title: string;
	onPress?: () => void;
	variant?: ButtonVariant;
	disabled?: boolean;
	loading?: boolean;
	style?: StyleProp<ViewStyle>;
}

export const Button = memo(function Button({
	title,
	onPress,
	variant = 'primary',
	disabled = false,
	loading = false,
	style,
}: ButtonProps) {
	const inactive = disabled || loading;
	return (
		<Pressable
			style={[
				styles.base,
				fillStyle[variant],
				inactive ? styles.inactive : null,
				style,
			]}
			disabled={inactive}
			onPress={onPress}>
			{loading ? (
				<ActivityIndicator
					color={
						variant === 'primary'
							? tokens.color.onPrimary
							: variant === 'danger'
								? '#fff'
								: tokens.color.text
					}
				/>
			) : (
				<Text
					variant="label"
					style={[styles.label, textStyle[variant]]}>
					{title}
				</Text>
			)}
		</Pressable>
	);
});

const styles = StyleSheet.create({
	base: {
		paddingVertical: tokens.space.md,
		paddingHorizontal: tokens.space.lg,
		borderRadius: tokens.radius.md,
		borderWidth: 1,
		alignItems: 'center',
		justifyContent: 'center',
	},
	label: {
		textShadowColor: 'rgba(0,0,0,0.35)',
		textShadowOffset: { width: 0, height: 1 },
		textShadowRadius: 2,
	},
	inactive: { opacity: 0.4 },
});

const fillStyle = StyleSheet.create({
	primary: {
		backgroundColor: tokens.color.primary,
		borderColor: 'rgba(255,255,255,0.22)',
	},
	secondary: {
		backgroundColor: tokens.color.surface,
		borderColor: tokens.color.border,
	},
	ghost: { backgroundColor: 'transparent', borderColor: tokens.color.border },
	danger: {
		backgroundColor: tokens.color.danger,
		borderColor: 'rgba(255,255,255,0.22)',
	},
});

const textStyle = StyleSheet.create({
	primary: { color: tokens.color.onPrimary },
	secondary: { color: tokens.color.text },
	ghost: { color: tokens.color.textMuted },
	danger: { color: '#fff' },
});
