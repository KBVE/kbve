import { useCallback } from 'react';
import { useKbve } from '../auth/KbveProvider';
import { S3BackupPanel } from '../dash/S3BackupPanel';

export function S3BackupScreen() {
	const { client } = useKbve();
	const getToken = useCallback(async () => {
		const { data } = await client.auth.getSession();
		return data.session?.access_token ?? null;
	}, [client]);

	return <S3BackupPanel getToken={getToken} baseUrl="https://kbve.com" />;
}
