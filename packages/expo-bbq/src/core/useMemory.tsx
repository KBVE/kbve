// NOT DONE.

import { useMemo, useCallback } from 'react';
import useCache from './useCache';

export const useMemory = <T,>(key: string, fetchData: () => Promise<T>) => {
	const { data, loading } = useCache<T>(key, fetchData);
	const refreshData = useCallback(async () => {
		await fetchData();
	}, [fetchData]);
	return useMemo(() => ({ data, loading, refreshData }), [data, loading, refreshData]);
};

export default useMemory;
