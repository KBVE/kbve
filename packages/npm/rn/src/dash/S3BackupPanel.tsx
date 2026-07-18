import { useMemo } from 'react';
import { Stack } from './_ui';
import { StreamView } from './StreamView';
import {
	createKilobaseBackupStream,
	kilobaseBackupLens,
} from './adapters/kilobaseBackup';

export interface S3BackupPanelProps {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
}

export function S3BackupPanel({ getToken, baseUrl = '' }: S3BackupPanelProps) {
	const store = useMemo(
		() => createKilobaseBackupStream({ getToken, baseUrl }),
		[getToken, baseUrl],
	);

	return (
		<Stack gap="md">
			<StreamView
				store={store}
				lens={kilobaseBackupLens}
				layout="rows"
				searchPlaceholder="filter by object key"
			/>
		</Stack>
	);
}
