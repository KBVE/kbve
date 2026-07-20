import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from '../../ui/primitives/Text';
import {
	isWatched as readIsWatched,
	subscribe,
	toggleWatch,
} from './watchlist';

export interface WatchToggleProps {
	kind: string;
	itemRef: string;
	size?: 'sm' | 'md';
}

export function WatchToggle({ kind, itemRef, size = 'md' }: WatchToggleProps) {
	const [watched, setWatched] = useState(false);
	useEffect(() => {
		const entry = { kind, ref: itemRef };
		setWatched(readIsWatched(entry));
		return subscribe(() => setWatched(readIsWatched(entry)));
	}, [kind, itemRef]);
	const onPress = useCallback(() => {
		toggleWatch({ kind, ref: itemRef });
	}, [kind, itemRef]);
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={
				watched ? 'Remove from watch list' : 'Add to watch list'
			}
			style={styles.btn}>
			<Text
				variant={size === 'sm' ? 'caption' : 'body'}
				tone={watched ? 'default' : 'muted'}>
				{watched ? '★' : '☆'}
			</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({ btn: { padding: 4 } });
