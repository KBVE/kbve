import React, { useMemo, useCallback, Suspense } from 'react';
import useCache from './useCache';
import { Spinner, YStack } from 'tamagui';

type LazyComponentProps<T> = {
	data: T;
	loading: boolean;
};

export const useMemory = <T, P, >(
	key: string,
	fetchData: () => Promise<T>,
	Component: React.ComponentType<LazyComponentProps<T> & P>,
	Skeleton?: React.ComponentType,
	extraProps?: P,
) => {
	const { data, loading } = useCache<T>(key, fetchData);

	const refreshData = useCallback(async () => {
		await fetchData();
	}, [fetchData]);

	const LazyLoadedComponent = useMemo(() => {
		const LazyComponent = React.lazy(async () => {
			return {
				default: () =>
					data ? (
						<Component data={data} loading={loading} {...(extraProps as P)} />
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
	}, [data, loading, Component, Skeleton, extraProps]);

	return { LazyLoadedComponent, refreshData };
};

export default useMemory;
