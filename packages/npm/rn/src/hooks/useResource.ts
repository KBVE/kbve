import { useEffect } from 'react';
import type { Resource, ResourceState } from '@kbve/core';
import { useSignal } from './useSignal';

export interface UseResourceResult<T> extends ResourceState<T> {
	refresh: () => void;
}

export function useResource<T>(resource: Resource<T>): UseResourceResult<T> {
	const state = useSignal(resource.state);
	useEffect(() => {
		void resource.load();
		return () => resource.cancel();
	}, [resource]);
	return { ...state, refresh: () => void resource.refresh() };
}
