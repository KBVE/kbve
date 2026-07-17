import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../theme';
import { Text } from '../primitives/Text';
import { NavIcon } from './NavIcon.web';

export interface TabItem {
	id: string;
	label: string;
	icon: string;
}

export interface TabBarProps {
	tabs: TabItem[];
	active: string;
	onTabPress: (id: string) => void;
}

export const TabBar = memo(function TabBar({
	tabs,
	active,
	onTabPress,
}: TabBarProps) {
	const insets = useSafeAreaInsets();
	return (
		<View
			style={[
				styles.bar,
				{ paddingBottom: insets.bottom + tokens.space.xs },
			]}>
			{tabs.map((tab) => {
				const on = tab.id === active;
				const color = on
					? tokens.color.primary
					: tokens.color.textFaint;
				return (
					<Pressable
						key={tab.id}
						style={styles.tab}
						onPress={() => onTabPress(tab.id)}>
						<NavIcon name={tab.icon} size={22} color={color} />
						<Text
							variant="caption"
							style={[styles.label, { color }]}>
							{tab.label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
});

const styles = StyleSheet.create({
	bar: {
		flexDirection: 'row',
		backgroundColor: tokens.color.surface,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: tokens.color.border,
		paddingTop: tokens.space.sm,
	},
	tab: { flex: 1, alignItems: 'center', gap: 2 },
	label: { fontWeight: '600' },
});
