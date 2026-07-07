import { memo } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from 'react-native-reanimated';
import { tokens } from '../theme';
import { useTheme } from '../ThemeProvider';
import { Text } from './Text';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ButtonVariant =
	| 'primary'
	| 'secondary'
	| 'outline'
	| 'ghost'
	| 'danger'
	| 'danger-ghost';

export interface ButtonProps {
	title?: string;
	children?: ReactNode;
	onPress?: () => void;
	variant?: ButtonVariant;
	disabled?: boolean;
	loading?: boolean;
	style?: StyleProp<ViewStyle>;
	/** Accessible name (maps to aria-label on web). Required for icon-only buttons. */
	accessibilityLabel?: string;
	accessibilityHint?: string;
}

export const Button = memo(function Button({
	title,
	children,
	onPress,
	variant = 'primary',
	disabled = false,
	loading = false,
	style,
	accessibilityLabel,
	accessibilityHint,
}: ButtonProps) {
	const t = useTheme();
	const inactive = disabled || loading;
	const scale = useSharedValue(1);
	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));

	const fill: ViewStyle = {
		primary: {
			backgroundColor: t.color.primary,
			borderColor: 'rgba(255,255,255,0.22)',
		},
		secondary: {
			backgroundColor: t.color.surface,
			borderColor: t.color.border,
		},
		outline: {
			backgroundColor: 'transparent',
			borderColor: t.color.border,
		},
		ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
		danger: {
			backgroundColor: t.color.danger,
			borderColor: 'rgba(255,255,255,0.22)',
		},
		'danger-ghost': {
			backgroundColor: 'transparent',
			borderColor: t.color.border,
		},
	}[variant];

	const labelColor = {
		primary: t.color.onPrimary,
		secondary: t.color.text,
		outline: t.color.text,
		ghost: t.color.textMuted,
		danger: '#fff',
		'danger-ghost': t.color.danger,
	}[variant];

	return (
		<AnimatedPressable
			style={[
				styles.base,
				fill,
				inactive ? styles.inactive : null,
				animatedStyle,
				style,
			]}
			disabled={inactive}
			accessibilityRole="button"
			accessibilityLabel={
				accessibilityLabel ??
				(typeof title === 'string' ? title : undefined)
			}
			accessibilityHint={accessibilityHint}
			accessibilityState={{ disabled: inactive }}
			onPressIn={() => {
				scale.value = withSpring(0.95, { damping: 18, stiffness: 320 });
			}}
			onPressOut={() => {
				scale.value = withSpring(1, { damping: 14, stiffness: 260 });
			}}
			onPress={onPress}>
			{loading ? (
				<ActivityIndicator color={labelColor} />
			) : (
				<Text
					variant="label"
					style={[styles.label, { color: labelColor }]}>
					{children ?? title}
				</Text>
			)}
		</AnimatedPressable>
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
