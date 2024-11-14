import { useCallback, Suspense } from 'react';
import useCache from './useCache';
import React from 'react';

const useLazyMemory = <T,>(key: string, fetchData: () => Promise<T>) => {
    const CachedDataComponent = React.lazy(async () => {
        const data = await fetchData();
        return { default: () => <>{data}</> };
    });

    const refreshData = useCallback(async () => {
        await fetchData();
    }, [fetchData]);

    return { CachedDataComponent, refreshData };
};

export default useLazyMemory;