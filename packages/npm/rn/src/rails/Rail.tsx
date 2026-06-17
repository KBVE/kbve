import { memo, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from 'react-native-reanimated';
import { tokens } from '../ui/theme';
import { Text } from '../ui/primitives/Text';
import { RailItem } from './RailItem';
import { useRailPlatform } from './useRailPlatform';
import type {
	RailExpandTrigger,
	RailGroupModel,
	RailItemModel,
	RailOrientation,
} from './models';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface RailProps {
	groups?: readonly RailGroupModel[];
	items?: readonly RailItemModel[];
	orientation?: RailOrientation;
	expanded: boolean;
	onExpandedChange?: (expanded: boolean) => void;
	pinned?: boolean;
	onTogglePin?: () => void;
	trigger?: RailExpandTrigger;
	collapsedSize?: number;
	expandedSize?: number;
	header?: ReactNode;
	footer?: ReactNode;
	bare?: boolean;
}

export const Rail = memo(function Rail({
	groups,
	items,
	orientation = 'vertical',
	expanded,
	onExpandedChange,
	pinned = false,
	onTogglePin,
	trigger,
	collapsedSize = 60,
	expandedSize = 224,
	header,
	footer,
	bare = false,
}: RailProps) {
	const platform = useRailPlatform();
	const mode = trigger ?? platform.defaultTrigger;
	const horizontal = orientation === 'horizontal';

	const progress = useSharedValue(expanded ? 1 : 0);
	useEffect(() => {
		progress.value = withTiming(expanded ? 1 : 0, {
			duration: 220,
			easing: Easing.out(Easing.cubic),
		});
	}, [expanded, progress]);

	const sizeStyle = useAnimatedStyle(() => {
		const size =
			collapsedSize + (expandedSize - collapsedSize) * progress.value;
		return horizontal ? { height: size } : { width: size };
	});

	const resolvedGroups: readonly RailGroupModel[] = useMemo(() => {
		if (groups) return groups;
		if (items) return [{ id: 'default', items }];
		return [];
	}, [groups, items]);

	const hoverProps =
		mode === 'hover' && platform.canHover
			? {
					onHoverIn: () => onExpandedChange?.(true),
					onHoverOut: () => onExpandedChange?.(false),
				}
			: {};

	return (
		<AnimatedPressable
			{...hoverProps}
			style={[
				styles.rail,
				horizontal ? styles.railHorizontal : styles.railVertical,
				bare ? styles.bare : null,
				sizeStyle,
			]}>
			{header ? <View style={styles.header}>{header}</View> : null}

			<ScrollView
				horizontal={horizontal}
				showsVerticalScrollIndicator={false}
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={
					horizontal ? styles.bodyHorizontal : styles.bodyVertical
				}>
				{resolvedGroups.map((group) => (
					<View
						key={group.id}
						style={horizontal ? styles.groupH : styles.groupV}>
						{group.title && expanded && !horizontal ? (
							<Text
								variant="caption"
								tone="faint"
								numberOfLines={1}
								style={styles.groupTitle}>
								{group.title}
							</Text>
						) : null}
						{group.items.map((item) => (
							<RailItem
								key={item.id}
								model={item}
								progress={progress}
								orientation={orientation}
							/>
						))}
					</View>
				))}
			</ScrollView>

			{footer ? <View style={styles.footer}>{footer}</View> : null}

			{mode !== 'hover' || pinned ? (
				<Pressable
					onPress={() =>
						onTogglePin
							? onTogglePin()
							: onExpandedChange?.(!expanded)
					}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel={
						pinned
							? 'Collapse rail'
							: expanded
								? 'Collapse rail'
								: 'Expand rail'
					}
					style={styles.toggle}>
					<Ionicons
						name={
							horizontal
								? expanded
									? 'chevron-up'
									: 'chevron-down'
								: expanded
									? 'chevron-back'
									: 'chevron-forward'
						}
						size={18}
						color={
							pinned
								? tokens.color.primary
								: tokens.color.textFaint
						}
					/>
				</Pressable>
			) : null}
		</AnimatedPressable>
	);
});

const styles = StyleSheet.create({
	rail: {
		backgroundColor: tokens.color.surface,
		borderColor: tokens.color.border,
		overflow: 'hidden',
	},
	bare: {
		backgroundColor: 'transparent',
		borderWidth: 0,
		borderRightWidth: 0,
		borderTopWidth: 0,
	},
	railVertical: {
		flexDirection: 'column',
		borderRightWidth: StyleSheet.hairlineWidth,
		paddingVertical: tokens.space.sm,
	},
	railHorizontal: {
		flexDirection: 'row',
		alignItems: 'center',
		borderTopWidth: StyleSheet.hairlineWidth,
		paddingHorizontal: tokens.space.sm,
	},
	header: {
		paddingHorizontal: tokens.space.sm,
		paddingBottom: tokens.space.sm,
	},
	footer: { paddingHorizontal: tokens.space.sm, paddingTop: tokens.space.sm },
	bodyVertical: { gap: tokens.space.lg, paddingHorizontal: tokens.space.sm },
	bodyHorizontal: {
		gap: tokens.space.lg,
		paddingVertical: tokens.space.sm,
		alignItems: 'center',
	},
	groupV: { gap: 2 },
	groupH: { flexDirection: 'row', gap: 2, alignItems: 'center' },
	groupTitle: {
		paddingHorizontal: tokens.space.sm,
		paddingVertical: tokens.space.xs,
		textTransform: 'uppercase',
		letterSpacing: 1,
	},
	toggle: {
		alignSelf: 'center',
		padding: tokens.space.xs,
		marginTop: tokens.space.xs,
	},
});
