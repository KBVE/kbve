import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import type { DimensionValue, ViewStyle } from 'react-native';
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
} from 'react-native-reanimated';
import { tokens } from '../theme';

export interface SkeletonProps {
	width?: DimensionValue;
	height?: number;
	radius?: number;
	style?: ViewStyle;
}

export const Skeleton = memo(function Skeleton({
	width = '100%',
	height = 16,
	radius = tokens.radius.sm,
	style,
}: SkeletonProps) {
	const pulse = useSharedValue(0.4);

	useEffect(() => {
		pulse.value = withRepeat(
			withSequence(
				withTiming(0.8, { duration: 650 }),
				withTiming(0.4, { duration: 650 }),
			),
			-1,
			false,
		);
	}, []);

	const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));

	return (
		<Animated.View
			style={[
				styles.base,
				{ width, height, borderRadius: radius },
				animated,
				style,
			]}
		/>
	);
});

export const SkeletonGroup = memo(function SkeletonGroup({
	rows = 3,
}: {
	rows?: number;
}) {
	return (
		<View style={styles.group}>
			{Array.from({ length: rows }, (_, i) => (
				<Skeleton key={i} width={i % 2 === 0 ? '100%' : '70%'} />
			))}
		</View>
	);
});

const styles = StyleSheet.create({
	base: { backgroundColor: tokens.color.surfaceAlt },
	group: { gap: tokens.space.sm, padding: tokens.space.lg },
});
