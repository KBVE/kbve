import { Pressable } from 'react-native';
import { Stack, Text } from '../_ui';
import { useStream, useStreamLifecycle } from '../useStream';
import type { StreamStore } from '../types';
import type { LogItem } from '../adapters/clickhouse';
import { errorGroupsLens, type ErrorGroupItem } from './errorGroupsStream';

export function ErrorDigest({
	store,
	primary,
}: {
	store: StreamStore<ErrorGroupItem>;
	primary: StreamStore<LogItem>;
}) {
	useStreamLifecycle(store);
	const state = useStream(store);
	if (!state.items.length) return null;
	return (
		<Stack gap="xs">
			<Text variant="label" tone="muted">
				Error digest
			</Text>
			{state.items.map((it) => (
				<Pressable
					key={store.id(it)}
					onPress={() =>
						primary.setParams({ pod_namespace: it.namespace || undefined, level: 'error' })
					}
				>
					{errorGroupsLens.row(it, false)}
				</Pressable>
			))}
		</Stack>
	);
}
