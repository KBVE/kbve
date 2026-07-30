import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from 'react-native-reanimated';
import { tokens } from '../theme';
import { Text } from '../primitives/Text';

export type ProgressTone = 'primary' | 'success' | 'danger';

export interface ProgressBarProps {
	value?: number;
	indeterminate?: boolean;
	tone?: ProgressTone;
	height?: number;
	label?: string;
	style?: ViewStyle;
}

const TONE_COLOR: Record<ProgressTone, string> = {
	primary: tokens.color.primary,
	success: tokens.color.success,
	danger: tokens.color.danger,
};

export const ProgressBar = memo(function ProgressBar({
	value = 0,
	indeterminate = false,
	tone = 'primary',
	height = 6,
	label,
	style,
}: ProgressBarProps) {
	const clamped = Math.max(0, Math.min(1, value));
	const pct = useSharedValue(clamped);
	const slide = useSharedValue(0);

	useEffect(() => {
		pct.value = withTiming(clamped, { duration: 260 });
	}, [clamped]);

	useEffect(() => {
		if (!indeterminate) {
			slide.value = 0;
			return;
		}
		slide.value = 0;
		slide.value = withRepeat(withTiming(1, { duration: 1100 }), -1, false);
	}, [indeterminate]);

	const fill = useAnimatedStyle(() =>
		indeterminate
			? {
					width: '35%',
					left: `${slide.value * 100 - 35}%`,
				}
			: { width: `${pct.value * 100}%`, left: 0 },
	);

	const percentLabel = indeterminate ? null : `${Math.round(clamped * 100)}%`;

	return (
		<View style={style}>
			{label || percentLabel ? (
				<View style={styles.head}>
					{label ? (
						<Text variant="caption" tone="muted">
							{label}
						</Text>
					) : null}
					{percentLabel ? (
						<Text variant="caption" tone="muted">
							{percentLabel}
						</Text>
					) : null}
				</View>
			) : null}
			<View
				accessibilityRole="progressbar"
				accessibilityValue={
					indeterminate
						? undefined
						: { min: 0, max: 100, now: Math.round(clamped * 100) }
				}
				style={[styles.track, { height, borderRadius: height }]}>
				<Animated.View
					style={[
						styles.fill,
						{ backgroundColor: TONE_COLOR[tone], borderRadius: height },
						fill,
					]}
				/>
			</View>
		</View>
	);
});

const styles = StyleSheet.create({
	head: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginBottom: tokens.space.xs,
	},
	track: {
		backgroundColor: tokens.color.surfaceAlt,
		borderWidth: 1,
		borderColor: tokens.color.border,
		overflow: 'hidden',
	},
	fill: { position: 'absolute', top: 0, bottom: 0 },
});

export default ProgressBar;
