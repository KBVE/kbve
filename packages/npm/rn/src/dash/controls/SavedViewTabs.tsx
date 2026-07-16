import { Pressable, StyleSheet } from 'react-native';
import { Stack, Text, tokens } from '../_ui';
import type { StreamStore, SavedView } from '../types';

export function SavedViewTabs<T>({ store, views, activeViewId }: {
	store: StreamStore<T>; views: SavedView[]; activeViewId: string | null;
}) {
	if (!views.length) return null;
	return (
		<Stack direction="row" gap="xs" wrap>
			{views.map((v) => {
				const on = v.id === activeViewId;
				return (
					<Pressable key={v.id} onPress={() => store.applyView(v.id)}
						style={[styles.tab, on ? styles.tabOn : null]}>
						<Text variant="caption" weight={on ? 'medium' : undefined}
							style={{ color: on ? tokens.color.onPrimary : tokens.color.textMuted }}>
							{v.name}
						</Text>
					</Pressable>
				);
			})}
		</Stack>
	);
}
const styles = StyleSheet.create({
	tab: { paddingHorizontal: tokens.space.md, paddingVertical: 4, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: tokens.color.border },
	tabOn: { backgroundColor: tokens.color.primary, borderColor: tokens.color.primary },
});
