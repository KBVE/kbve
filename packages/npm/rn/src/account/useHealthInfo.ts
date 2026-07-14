import { useCallback, useEffect, useState } from 'react';
import type { DataHook, HealthCheck } from './types';

function probe(): HealthCheck[] {
	return [
		{
			label: 'Native diagnostics',
			status: 'unavailable',
			detail: 'Coming soon',
		},
	];
}

export function useHealthInfo(): DataHook<HealthCheck[]> {
	const [data, setData] = useState<HealthCheck[] | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(() => {
		setData(probe());
		setLoading(false);
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	return { data, loading, refresh };
}
