import { memo, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	withTiming,
} from 'react-native-reanimated';
import { tokens } from '../ui/theme';
import { useRailPlatform } from './useRailPlatform';
import type { RailEdge } from './models';

export interface FloatingRailProps {
	edge: RailEdge;
	onEdgeChange?: (edge: RailEdge) => void;
	inset?: number;
	draggable?: boolean;
	children: ReactNode;
}

const SNAP = { damping: 20, stiffness: 220, mass: 0.6 };

export const FloatingRail = memo(function FloatingRail({
	edge,
	onEdgeChange,
	inset = tokens.space.md,
	draggable,
	children,
}: FloatingRailProps) {
	const platform = useRailPlatform();
	const insets = useSafeAreaInsets();
	const { width, height } = useWindowDimensions();
	const canDrag = draggable ?? platform.canDrag;

	const tx = useSharedValue(0);
	const ty = useSharedValue(0);
	const active = useSharedValue(0);

	const reportEdge = useCallback(
		(next: RailEdge) => {
			if (next !== edge) onEdgeChange?.(next);
		},
		[edge, onEdgeChange],
	);

	const pan = useMemo(
		() =>
			Gesture.Pan()
				.enabled(canDrag)
				.activateAfterLongPress(120)
				.onStart(() => {
					active.value = withTiming(1, { duration: 120 });
				})
				.onUpdate((e) => {
					tx.value = e.translationX;
					ty.value = e.translationY;
				})
				.onEnd((e) => {
					const x = e.absoluteX;
					const y = e.absoluteY;
					const dl = x;
					const dr = width - x;
					const dt = y;
					const db = height - y;
					let next: RailEdge = 'left';
					let min = dl;
					if (dr < min) {
						min = dr;
						next = 'right';
					}
					if (dt < min) {
						min = dt;
						next = 'top';
					}
					if (db < min) {
						min = db;
						next = 'bottom';
					}
					tx.value = withSpring(0, SNAP);
					ty.value = withSpring(0, SNAP);
					active.value = withTiming(0, { duration: 160 });
					runOnJS(reportEdge)(next);
				})
				.onFinalize(() => {
					active.value = withTiming(0, { duration: 160 });
				}),
		[canDrag, width, height, tx, ty, active, reportEdge],
	);

	const dragStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateX: tx.value },
			{ translateY: ty.value },
			{ scale: 1 + active.value * 0.03 },
		],
		shadowOpacity: 0.3 + active.value * 0.2,
		shadowRadius: 16 + active.value * 8,
	}));

	const anchor = useMemo(() => {
		const top = inset + insets.top;
		const bottom = inset + insets.bottom;
		const left = inset + insets.left;
		const right = inset + insets.right;
		switch (edge) {
			case 'left':
				return { top, bottom, left };
			case 'right':
				return { top, bottom, right };
			case 'top':
				return { top, left, right };
			case 'bottom':
				return { bottom, left, right };
		}
	}, [edge, inset, insets]);

	return (
		<View style={StyleSheet.absoluteFill} pointerEvents="box-none">
			<GestureDetector gesture={pan}>
				<Animated.View style={[styles.floating, anchor, dragStyle]}>
					{children}
				</Animated.View>
			</GestureDetector>
		</View>
	);
});

const styles = StyleSheet.create({
	floating: {
		position: 'absolute',
		borderRadius: tokens.radius.xl,
		borderWidth: 1,
		borderColor: tokens.color.border,
		backgroundColor: tokens.color.surface,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 8 },
		shadowOpacity: 0.3,
		shadowRadius: 16,
		elevation: 12,
	},
});
