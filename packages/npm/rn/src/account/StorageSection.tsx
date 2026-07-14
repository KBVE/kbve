import { Surface } from '../ui/primitives/Surface';
import { Stack } from '../ui/primitives/Stack';
import { Text } from '../ui/primitives/Text';
import { Button } from '../ui/primitives/Button';
import { StatGrid } from '../dash/StatGrid';
import type { StatModel } from '../dash/types';
import { formatBytes } from '../dash/shared';
import { useStorageInfo } from './useStorageInfo';

export function StorageSection() {
	const { data, loading, clear } = useStorageInfo();

	const stats: StatModel[] = data
		? [
				{ id: 'usage', label: 'Used', value: formatBytes(data.usage) },
				{ id: 'quota', label: 'Quota', value: formatBytes(data.quota) },
				{ id: 'percent', label: 'Percent', value: `${data.percent}%` },
				{ id: 'items', label: 'Items', value: data.itemCount },
			]
		: [];

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
					title="Clear local storage"
					onPress={() => void clear()}
				/>
			</Stack>
		</Surface>
	);
}
