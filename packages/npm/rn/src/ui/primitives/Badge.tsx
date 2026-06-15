import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { tokens } from '../theme';
import { Text } from './Text';

export type BadgeTone =
	| 'neutral'
	| 'primary'
	| 'success'
	| 'danger'
	| 'warning';

export interface BadgeProps {
	label: string;
	tone?: BadgeTone;
}

export const Badge = memo(function Badge({
	label,
	tone = 'neutral',
}: BadgeProps) {
	return (
		<View style={[styles.base, toneStyle[tone]]}>
			<Text variant="caption" weight="medium" style={textTone[tone]}>
				{label}
			</Text>
		</View>
	);
});

const styles = StyleSheet.create({
	base: {
		paddingHorizontal: tokens.space.sm,
		paddingVertical: 2,
		borderRadius: tokens.radius.pill,
		alignSelf: 'flex-start',
	},
});

const toneStyle = StyleSheet.create({
	neutral: { backgroundColor: tokens.color.surfaceAlt },
	primary: { backgroundColor: tokens.color.primary },
	success: { backgroundColor: '#0e2a1a' },
	danger: { backgroundColor: '#2a0e12' },
	warning: { backgroundColor: '#2a210e' },
});

const textTone = StyleSheet.create({
	neutral: { color: tokens.color.textMuted },
	primary: { color: tokens.color.onPrimary },
	success: { color: tokens.color.success },
	danger: { color: tokens.color.danger },
	warning: { color: tokens.color.warning },
});
