import { useCallback } from 'react';
import { useKbve } from '../auth/KbveProvider';
import { McView } from '../dash/mc';

export function McScreen() {
	const { client } = useKbve();
	const getToken = useCallback(async () => {
		const { data } = await client.auth.getSession();
		return data.session?.access_token ?? null;
	}, [client]);

	return <McView getToken={getToken} baseUrl="https://kbve.com" />;
}
