import { useCallback } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import type { ListRenderItemInfo } from 'react-native';
import { tokens } from '../theme';
import { AppCard } from './AppCard';
import type { CardModel } from '../models';

const keyExtractor = (item: CardModel) => item.id;
const Separator = () => <View style={styles.separator} />;

export function CardList({ items }: { items: readonly CardModel[] }) {
	const renderItem = useCallback(
		({ item }: ListRenderItemInfo<CardModel>) => <AppCard model={item} />,
		[],
	);
	return (
		<FlatList
			data={items as CardModel[]}
			keyExtractor={keyExtractor}
			renderItem={renderItem}
			ItemSeparatorComponent={Separator}
			contentContainerStyle={styles.content}
			removeClippedSubviews={false}
		/>
	);
}

const styles = StyleSheet.create({
	content: { padding: tokens.space.lg },
	separator: { height: tokens.space.md },
});
