import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
	useAnimatedStyle,
	type SharedValue,
} from 'react-native-reanimated';
import { tokens } from '../ui/theme';
import { Text } from '../ui/primitives/Text';
import { Badge } from '../ui/primitives/Badge';
import type { RailItemModel, RailOrientation } from './models';

export interface RailItemProps {
	model: RailItemModel;
	progress: SharedValue<number>;
	orientation: RailOrientation;
	iconSize?: number;
}

export const RailItem = memo(function RailItem({
	model,
	progress,
	orientation,
	iconSize = 22,
}: RailItemProps) {
	const labelStyle = useAnimatedStyle(() => ({
		opacity: progress.value,
		transform: [{ translateX: (1 - progress.value) * -8 }],
	}));

	const color = model.disabled
		? tokens.color.textFaint
		: model.active
			? tokens.color.primary
			: tokens.color.textMuted;

	const horizontal = orientation === 'horizontal';

	return (
		<Pressable
			disabled={model.disabled}
			onPress={model.onPress}
			accessibilityRole="button"
			accessibilityLabel={model.label}
			accessibilityState={{
				disabled: model.disabled,
				selected: model.active,
			}}
			style={({ pressed }) => [
				styles.item,
				horizontal ? styles.itemHorizontal : null,
				model.active ? styles.itemActive : null,
				pressed ? styles.itemPressed : null,
			]}>
			<View style={styles.iconWrap}>
				<Ionicons name={model.icon} size={iconSize} color={color} />
				{model.badge !== undefined ? (
					<View style={styles.badge}>
						<Badge label={String(model.badge)} tone="primary" />
					</View>
				) : null}
			</View>
			<Animated.View style={[styles.labelWrap, labelStyle]}>
				<Text
					variant="label"
					numberOfLines={1}
					style={[styles.label, { color }]}>
					{model.label}
				</Text>
			</Animated.View>
		</Pressable>
	);
});

const styles = StyleSheet.create({
	item: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.sm,
		paddingHorizontal: tokens.space.sm,
		paddingVertical: tokens.space.sm,
		borderRadius: tokens.radius.md,
	},
	itemHorizontal: { flexDirection: 'column', gap: 2 },
	itemActive: { backgroundColor: tokens.color.surfaceAlt },
	itemPressed: { opacity: 0.7 },
	iconWrap: {
		width: 32,
		height: 32,
		alignItems: 'center',
		justifyContent: 'center',
	},
	badge: { position: 'absolute', top: -4, right: -6 },
	labelWrap: { overflow: 'hidden' },
	label: { fontWeight: '600' },
});
