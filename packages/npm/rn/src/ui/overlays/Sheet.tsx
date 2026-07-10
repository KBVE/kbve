import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
	Animated,
	Easing,
	Modal,
	PanResponder,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	View,
	useWindowDimensions,
} from 'react-native';
import type { ViewStyle } from 'react-native';
import { useTheme } from '../ThemeProvider';

export type SheetPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface SheetProps {
	visible: boolean;
	onClose: () => void;
	placement?: SheetPlacement;
	/** Side sheets: width. Top/bottom sheets: max height. Defaults per axis. */
	size?: number;
	/** Bottom sheets only: draggable handle with expand / dismiss snap points. */
	draggable?: boolean;
	children: ReactNode;
}

const IN_MS = 260;
const OUT_MS = 200;
const CLOSE_DY = 120;
const EXPAND_DY = 56;
const UP_RUBBER = 64;

/**
 * Generic off-canvas sheet. Slides in from any edge (top / bottom / left /
 * right) over a dimmed backdrop. Bottom sheets get a draggable handle: drag to
 * nudge, drag up past a threshold to expand, drag down far enough to dismiss.
 * Renders through a native Modal (portal on react-native-web) with core
 * Animated (JS-driven), so it works unchanged on native and in Astro via
 * react-native-web.
 */
export function Sheet({
	visible,
	onClose,
	placement = 'bottom',
	size,
	draggable = true,
	children,
}: SheetProps) {
	const t = useTheme();
	const { width, height } = useWindowDimensions();
	const [rendered, setRendered] = useState(visible);
	const [expanded, setExpanded] = useState(false);
	const progress = useRef(new Animated.Value(0)).current;
	const dragY = useRef(new Animated.Value(0)).current;
	const expandedRef = useRef(false);

	useEffect(() => {
		expandedRef.current = expanded;
	}, [expanded]);

	useEffect(() => {
		if (visible) {
			dragY.setValue(0);
			setExpanded(false);
			setRendered(true);
			Animated.timing(progress, {
				toValue: 1,
				duration: IN_MS,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: true,
			}).start();
		} else if (rendered) {
			Animated.timing(progress, {
				toValue: 0,
				duration: OUT_MS,
				easing: Easing.in(Easing.cubic),
				useNativeDriver: true,
			}).start(({ finished }) => {
				if (finished) setRendered(false);
			});
		}
	}, [visible]);

	const isBottom = placement === 'bottom';
	const canDrag = isBottom && draggable;

	const pan = useMemo(
		() =>
			PanResponder.create({
				onMoveShouldSetPanResponder: (_, g) =>
					Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
				onPanResponderMove: (_, g) => {
					let dy = g.dy;
					if (dy < 0 && !expandedRef.current) {
						dy = -UP_RUBBER * (1 - UP_RUBBER / (UP_RUBBER - dy));
					}
					dragY.setValue(dy);
				},
				onPanResponderRelease: (_, g) => {
					if (g.dy > CLOSE_DY || g.vy > 1.2) {
						onClose();
						return;
					}
					if (!expandedRef.current && g.dy < -EXPAND_DY) {
						setExpanded(true);
					} else if (expandedRef.current && g.dy > EXPAND_DY) {
						setExpanded(false);
					}
					Animated.spring(dragY, {
						toValue: 0,
						useNativeDriver: true,
						bounciness: 2,
						speed: 16,
					}).start();
				},
			}),
		[onClose],
	);

	if (!rendered) return null;

	const horizontal = placement === 'left' || placement === 'right';
	const r = t.radius.xl;

	const offset =
		placement === 'bottom'
			? height
			: placement === 'top'
				? -height
				: placement === 'right'
					? width
					: -width;

	const slide = progress.interpolate({
		inputRange: [0, 1],
		outputRange: [offset, 0],
	});
	const translateY = isBottom ? Animated.add(slide, dragY) : slide;

	const root: ViewStyle = horizontal
		? {
				flexDirection: 'row',
				justifyContent:
					placement === 'left' ? 'flex-start' : 'flex-end',
			}
		: {
				justifyContent:
					placement === 'bottom' ? 'flex-end' : 'flex-start',
			};

	const maxH = size ?? (isBottom && expanded ? '94%' : '85%');
	const box: ViewStyle = horizontal
		? { height: '100%', width: size ?? Math.min(360, width * 0.86) }
		: { width: '100%', maxHeight: maxH };

	const shape: ViewStyle = {
		bottom: {
			borderTopLeftRadius: r,
			borderTopRightRadius: r,
			borderTopWidth: 1,
		},
		top: {
			borderBottomLeftRadius: r,
			borderBottomRightRadius: r,
			borderBottomWidth: 1,
		},
		left: {
			borderTopRightRadius: r,
			borderBottomRightRadius: r,
			borderRightWidth: 1,
		},
		right: {
			borderTopLeftRadius: r,
			borderBottomLeftRadius: r,
			borderLeftWidth: 1,
		},
	}[placement];

	return (
		<Modal
			visible
			transparent
			animationType="none"
			statusBarTranslucent
			onRequestClose={onClose}>
			<View style={[styles.root, root]}>
				<Animated.View style={[styles.backdrop, { opacity: progress }]}>
					<Pressable
						style={StyleSheet.absoluteFill}
						onPress={onClose}
						accessibilityRole="button"
						accessibilityLabel="Close"
					/>
				</Animated.View>
				<Animated.View
					style={[
						styles.sheet,
						box,
						shape,
						{
							backgroundColor: t.color.surface,
							borderColor: t.color.border,
							transform: [
								horizontal
									? { translateX: slide }
									: { translateY },
							],
						},
					]}>
					{canDrag ? (
						<View
							{...pan.panHandlers}
							style={styles.grip}
							accessibilityRole="adjustable"
							accessibilityLabel="Drag to resize or dismiss">
							<View
								style={[
									styles.handle,
									Platform.OS === 'web'
										? ({ cursor: 'grab' } as object)
										: null,
								]}
							/>
						</View>
					) : null}
					<ScrollView
						style={styles.scroll}
						contentContainerStyle={styles.scrollContent}
						showsVerticalScrollIndicator={false}
						bounces={false}>
						{children}
					</ScrollView>
				</Animated.View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	backdrop: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: 'rgba(0,0,0,0.55)',
	},
	sheet: { alignSelf: 'center', overflow: 'hidden' },
	grip: {
		alignItems: 'center',
		justifyContent: 'center',
		paddingTop: 10,
		paddingBottom: 4,
	},
	handle: {
		width: 44,
		height: 5,
		borderRadius: 999,
		backgroundColor: 'rgba(150,150,150,0.55)',
	},
	scroll: { flexGrow: 0, flexShrink: 1 },
	scrollContent: {},
});
