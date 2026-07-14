import { memo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { tokens } from '../theme';

export interface PressableSurfaceProps extends PressableProps {
	padded?: boolean;
	style?: StyleProp<ViewStyle>;
}

export const PressableSurface = memo(function PressableSurface({
	padded = true,
	disabled = false,
	style,
	children,
	...rest
}: PressableSurfaceProps) {
	return (
		<Pressable
			disabled={disabled}
			style={({ pressed }) => [
				styles.base,
				padded ? styles.padded : null,
				pressed ? styles.pressed : null,
				disabled ? styles.disabled : null,
				style as ViewStyle,
			]}
			{...rest}>
			{children}
		</Pressable>
	);
});

const styles = StyleSheet.create({
	base: {
		backgroundColor: tokens.color.surface,
		borderRadius: tokens.radius.lg,
		borderWidth: 1,
		borderColor: tokens.color.border,
	},
	padded: { padding: tokens.space.lg },
	pressed: { opacity: 0.7 },
	disabled: { opacity: 0.4 },
});
