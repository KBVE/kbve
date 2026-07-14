import { memo, useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import {
	ActivityIndicator,
	Platform,
	Pressable,
	StyleSheet,
} from 'react-native';
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
	/** Native hover tooltip. Web / Tauri only (sets DOM title); no-op on native. */
	tooltip?: string;
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
	tooltip,
}: ButtonProps) {
	const t = useTheme();
	const inactive = disabled || loading;
	const [hovered, setHovered] = useState(false);

	// Native browser tooltip on web / Tauri. RNW doesn't forward `title` as a
	// prop, but its refs resolve to the DOM node — set it imperatively.
	const tooltipRef = useCallback(
		(node: unknown) => {
			if (Platform.OS !== 'web' || !tooltip || !node) return;
			const el: any =
				(node as any).nodeType === 1 ? node : (node as any).getNode?.();
			if (el && typeof el.setAttribute === 'function') {
				el.setAttribute('title', tooltip);
			}
		},
		[tooltip],
	);
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
			backgroundColor: t.color.surfaceAlt,
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

	// Web hover feedback (no-op on native — hover events never fire there).
	const hoverFill: ViewStyle | null =
		hovered && !inactive
			? {
					primary: { borderColor: 'rgba(255,255,255,0.5)' },
					secondary: { borderColor: t.color.primary },
					outline: {
						borderColor: t.color.primary,
						backgroundColor: 'rgba(127,127,127,0.10)',
					},
					ghost: { backgroundColor: 'rgba(127,127,127,0.10)' },
					danger: { borderColor: 'rgba(255,255,255,0.5)' },
					'danger-ghost': {
						borderColor: t.color.danger,
						backgroundColor: 'rgba(239,68,68,0.10)',
					},
				}[variant]
			: null;

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
			ref={tooltipRef}
			style={[
				styles.base,
				fill,
				hoverFill,
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
			onHoverIn={() => setHovered(true)}
			onHoverOut={() => setHovered(false)}
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
