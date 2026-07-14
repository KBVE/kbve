import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { tokens } from '../theme';
import { PressableSurface } from '../primitives/PressableSurface';
import { Text } from '../primitives/Text';
import { Badge } from '../primitives/Badge';
import type { MenuItemModel } from '../models';

export const MenuItem = memo(function MenuItem({
	model,
}: {
	model: MenuItemModel;
}) {
	return (
		<PressableSurface
			disabled={model.disabled}
			onPress={model.onPress}
			padded={false}
			style={styles.item}>
			<View style={styles.text}>
				<Text
					variant="label"
					tone={model.destructive ? 'danger' : 'default'}>
					{model.label}
				</Text>
				{model.description ? (
					<Text variant="caption" tone="muted">
						{model.description}
					</Text>
				) : null}
			</View>
			{model.badge ? <Badge label={model.badge} /> : null}
			{model.trailingText ? (
				<Text variant="caption" tone="faint">
					{model.trailingText}
				</Text>
			) : null}
		</PressableSurface>
	);
});

const styles = StyleSheet.create({
	item: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.sm,
		paddingHorizontal: tokens.space.lg,
		paddingVertical: tokens.space.md,
	},
	text: { flex: 1, gap: 2 },
});
