import { useCallback, useEffect, useState } from 'react';
import type { DataHook, HealthCheck } from './types';
import { evaluateHealthChecks } from './healthChecks';

function probe(): HealthCheck[] {
	let storage = false;
	try {
		storage = typeof localStorage !== 'undefined';
	} catch {
		void 0;
	}
	return evaluateHealthChecks({
		serviceWorker: 'serviceWorker' in navigator,
		storage,
		indexedDB: typeof indexedDB !== 'undefined',
		online: navigator.onLine,
	});
}

export function useHealthInfo(): DataHook<HealthCheck[]> {
	const [data, setData] = useState<HealthCheck[] | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(() => {
		setLoading(true);
		setData(probe());
		setLoading(false);
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	return { data, loading, refresh };
}
