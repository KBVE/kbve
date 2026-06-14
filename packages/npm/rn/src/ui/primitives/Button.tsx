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
						variant === 'secondary' || variant === 'ghost'
							? tokens.color.text
							: '#fff'
					}
				/>
			) : (
				<Text variant="label" style={textStyle[variant]}>
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
		alignItems: 'center',
		justifyContent: 'center',
	},
	inactive: { opacity: 0.4 },
});

const fillStyle = StyleSheet.create({
	primary: { backgroundColor: tokens.color.primary },
	secondary: { backgroundColor: tokens.color.surface },
	ghost: {
		backgroundColor: 'transparent',
		borderWidth: 1,
		borderColor: tokens.color.border,
	},
	danger: { backgroundColor: tokens.color.danger },
});

const textStyle = StyleSheet.create({
	primary: { color: '#fff' },
	secondary: { color: tokens.color.text },
	ghost: { color: tokens.color.textMuted },
	danger: { color: '#fff' },
});
