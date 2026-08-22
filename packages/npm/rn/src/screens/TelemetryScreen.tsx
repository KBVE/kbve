import { useCallback } from 'react';
import { useKbve } from '../auth/KbveProvider';
import { TelemetryView } from '../dash/telemetry';

export function TelemetryScreen() {
	const { client } = useKbve();
	const getToken = useCallback(async () => {
		const { data } = await client.auth.getSession();
		return data.session?.access_token ?? null;
	}, [client]);

	// Its own origin, not kbve.com: the metrics service is routed separately.
	return <TelemetryView getToken={getToken} />;
}
