import { FlatList } from 'react-native';
import type { FlatListProps } from 'react-native';

export type VirtualListProps<T> = FlatListProps<T>;

export function VirtualList<T>(props: VirtualListProps<T>) {
	return <FlatList {...props} />;
}
