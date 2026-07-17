import { memo } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../theme';
import { Text } from '../primitives/Text';
import { NavIcon } from './NavIcon.web';

export interface AppBarProps {
	title: string;
	subtitle?: string;
	onBack?: () => void;
	right?: ReactNode;
}

export const AppBar = memo(function AppBar({
	title,
	subtitle,
	onBack,
	right,
}: AppBarProps) {
	const insets = useSafeAreaInsets();
	return (
		<View
			style={[styles.bar, { paddingTop: insets.top + tokens.space.sm }]}>
			{onBack ? (
				<Pressable onPress={onBack} hitSlop={8} style={styles.back}>
					<NavIcon
						name="chevron-back"
						size={24}
						color={tokens.color.text}
					/>
				</Pressable>
			) : null}
			<View style={styles.titles}>
				<Text variant="subtitle" numberOfLines={1}>
					{title}
				</Text>
				{subtitle ? (
					<Text variant="caption" tone="muted" numberOfLines={1}>
						{subtitle}
					</Text>
				) : null}
			</View>
			{right ? <View style={styles.right}>{right}</View> : null}
		</View>
	);
});

const styles = StyleSheet.create({
	bar: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.sm,
		paddingHorizontal: tokens.space.lg,
		paddingBottom: tokens.space.sm,
		backgroundColor: tokens.color.bg,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: tokens.color.border,
	},
	back: { padding: 2 },
	titles: { flex: 1, gap: 2 },
	right: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm },
});
