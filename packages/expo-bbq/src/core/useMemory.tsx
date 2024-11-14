import React, { useMemo, useCallback, Suspense } from 'react';
import useCache from './useCache';
import { Spinner, YStack } from 'tamagui';

type LazyComponentProps<T> = {
	data: T;
	loading: boolean;
};

export const useMemory = <T,>(
	key: string,
	fetchData: () => Promise<T>,
	Component: React.ComponentType<LazyComponentProps<T>>,
	Skeleton?: React.ComponentType,
) => {
	const { data, loading } = useCache<T>(key, fetchData);

	const refreshData = useCallback(async () => {
		await fetchData();
	}, [fetchData]);

	const LazyLoadedComponent = useMemo(() => {
		const LazyComponent = React.lazy(async () => {
			await fetchData();
			return {
				default: () =>
					data ? (
						<Component data={data} loading={loading} />
					) : Skeleton ? (
						<Skeleton />
					) : (
						<YStack padding="$3" gap="$4" alignItems="center">
							<Spinner size="large" />
						</YStack>
					),
			};
		});

		return () => (
			<Suspense
				fallback={Skeleton ? <Skeleton /> : <Spinner size="large" />}>
				<LazyComponent />
			</Suspense>
		);
	}, [data, loading, fetchData, Component, Skeleton]);

	return { LazyLoadedComponent, refreshData };
};

export default useMemory;
