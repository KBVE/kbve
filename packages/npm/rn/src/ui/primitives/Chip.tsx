import { memo } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { tokens } from '../theme';
import { useTheme } from '../ThemeProvider';
import { Text } from './Text';

export type ChipTone = 'default' | 'primary' | 'success' | 'danger' | 'muted';

export interface ChipProps {
	children?: ReactNode;
	label?: string;
	tone?: ChipTone;
	active?: boolean;
	onPress?: () => void;
	color?: string;
	background?: string;
	borderColor?: string;
	style?: ViewStyle;
}

export const Chip = memo(function Chip({
	children,
	label,
	tone = 'default',
	active = false,
	onPress,
	color,
	background,
	borderColor,
	style,
}: ChipProps) {
	const t = useTheme();
	const toned = {
		default: {
			bg: t.color.surfaceAlt,
			border: t.color.border,
			fg: t.color.textMuted,
		},
		primary: {
			bg: 'transparent',
			border: t.color.primary,
			fg: t.color.primary,
		},
		success: {
			bg: 'transparent',
			border: t.color.success,
			fg: t.color.success,
		},
		danger: {
			bg: 'transparent',
			border: t.color.danger,
			fg: t.color.danger,
		},
		muted: {
			bg: t.color.surface,
			border: t.color.border,
			fg: t.color.textFaint,
		},
	}[tone];

	const box: ViewStyle = {
		backgroundColor: background ?? toned.bg,
		borderColor: borderColor ?? toned.border,
		borderWidth: active ? 2 : 1,
	};
	const fg = color ?? toned.fg;
	const content = (
		<Text variant="caption" weight="medium" style={{ color: fg }}>
			{children ?? label}
		</Text>
	);

	if (onPress) {
		return (
			<Pressable style={[styles.base, box, style]} onPress={onPress}>
				{content}
			</Pressable>
		);
	}
	return <View style={[styles.base, box, style]}>{content}</View>;
});

const styles = StyleSheet.create({
	base: {
		alignSelf: 'flex-start',
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: tokens.space.sm,
		paddingVertical: 2,
		borderRadius: tokens.radius.pill,
	},
});
