import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { tokens } from '../theme';
import { Text } from '../primitives/Text';
import { MenuItem } from './MenuItem';
import type { MenuSectionModel } from '../models';

export const MenuList = memo(function MenuList({
	sections,
}: {
	sections: readonly MenuSectionModel[];
}) {
	return (
		<View style={styles.list}>
			{sections.map((section) => (
				<View key={section.id} style={styles.section}>
					{section.title ? (
						<Text
							variant="caption"
							tone="faint"
							style={styles.sectionTitle}>
							{section.title.toUpperCase()}
						</Text>
					) : null}
					<View style={styles.items}>
						{section.items.map((item) => (
							<MenuItem key={item.id} model={item} />
						))}
					</View>
				</View>
			))}
		</View>
	);
});

const styles = StyleSheet.create({
	list: { gap: tokens.space.lg },
	section: { gap: tokens.space.sm },
	sectionTitle: { paddingHorizontal: tokens.space.lg, letterSpacing: 1 },
	items: {
		backgroundColor: tokens.color.surface,
		borderRadius: tokens.radius.lg,
		borderWidth: 1,
		borderColor: tokens.color.border,
		overflow: 'hidden',
	},
});
