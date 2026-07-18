import { useCallback, useRef, useState } from 'react';
import { Surface } from '../ui/primitives/Surface';
import { Stack } from '../ui/primitives/Stack';
import { Text } from '../ui/primitives/Text';
import { Button } from '../ui/primitives/Button';
import { StatGrid } from '../dash/StatGrid';
import type { StatModel } from '../dash/types';
import { formatBytes } from '../dash/shared';
import { useStorageInfo } from './useStorageInfo';

type ClearState = 'idle' | 'armed' | 'clearing' | 'done' | 'error';

const ARM_TIMEOUT_MS = 4000;
const DONE_TIMEOUT_MS = 2500;

export function StorageSection() {
	const { data, loading, clear } = useStorageInfo();
	const [state, setState] = useState<ClearState>('idle');
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const resetTimer = useCallback((next: ClearState, ms: number) => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => setState(next), ms);
	}, []);

	const onPress = useCallback(async () => {
		if (state === 'clearing') return;
		if (state !== 'armed') {
			setState('armed');
			resetTimer('idle', ARM_TIMEOUT_MS);
			return;
		}
		if (timer.current) clearTimeout(timer.current);
		setState('clearing');
		try {
			await clear();
			setState('done');
			resetTimer('idle', DONE_TIMEOUT_MS);
		} catch {
			setState('error');
			resetTimer('idle', DONE_TIMEOUT_MS);
		}
	}, [state, clear, resetTimer]);

	const stats: StatModel[] = data
		? [
				{ id: 'usage', label: 'Used', value: formatBytes(data.usage) },
				{ id: 'quota', label: 'Quota', value: formatBytes(data.quota) },
				{ id: 'percent', label: 'Percent', value: `${data.percent}%` },
				{ id: 'items', label: 'Items', value: data.itemCount },
			]
		: [];

	const title =
		state === 'armed'
			? 'Tap again to confirm'
			: state === 'done'
				? 'Cleared'
				: state === 'error'
					? 'Failed — try again'
					: 'Clear local storage';

	return (
		<Surface>
			<Stack gap="md">
				<Text variant="label">Storage</Text>
				{loading ? (
					<Text tone="muted">Loading…</Text>
				) : (
					<StatGrid stats={stats} />
				)}
				<Button
					variant="danger"
					title={title}
					loading={state === 'clearing'}
					onPress={() => void onPress()}
					accessibilityLabel="Clear local storage"
					accessibilityHint="Signs you out and clears all cached data on this device"
				/>
				{state === 'armed' ? (
					<Text tone="muted">
						This signs you out and clears all cached data on this
						device.
					</Text>
				) : null}
			</Stack>
		</Surface>
	);
}
