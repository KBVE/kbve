import { useCallback } from 'react';
import { useKbve } from '../auth/KbveProvider';
import { ClickHouseView } from '../dash/clickhouse';

export function ClickHouseScreen() {
	const { client } = useKbve();
	const getToken = useCallback(async () => {
		const { data } = await client.auth.getSession();
		return data.session?.access_token ?? null;
	}, [client]);

	return <ClickHouseView getToken={getToken} baseUrl="https://kbve.com" />;
}
