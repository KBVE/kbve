import { Pressable } from 'react-native';
import { Stack } from '../_ui';
import { useStream, useStreamLifecycle } from '../useStream';
import type { StreamStore } from '../types';
import type { LogItem } from '../adapters/clickhouse';
import { errorGroupsLens, type ErrorGroupItem } from './errorGroupsStream';
import { SectionDivider } from '../shared';

export function ErrorDigest({
	store,
	primary,
}: {
	store: StreamStore<ErrorGroupItem>;
	primary: StreamStore<LogItem>;
}) {
	useStreamLifecycle(store);
	const state = useStream(store);
	const primaryState = useStream(primary);
	const focusedNs = primaryState.params['pod_namespace'];
	if (typeof focusedNs === 'string' && focusedNs !== '') return null;
	if (!state.items.length) return null;
	return (
		<Stack gap="xs">
			<SectionDivider label="Error Digest" />
			{state.items.map((it) => (
				<Pressable
					key={store.id(it)}
					onPress={() =>
						primary.setParams({
							pod_namespace: it.namespace || undefined,
							level: 'error',
						})
					}>
					{errorGroupsLens.row(it, false)}
				</Pressable>
			))}
		</Stack>
	);
}
