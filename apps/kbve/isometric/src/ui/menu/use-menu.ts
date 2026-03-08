import { useContext, useCallback } from 'react';
import { MenuDispatchContext } from './menu-context';
import type { SettingsCategory } from './menu-types';

export function useMenu() {
	const dispatch = useContext(MenuDispatchContext);

	const toggle = useCallback(() => {
		dispatch({ type: 'TOGGLE' });
	}, [dispatch]);

	const open = useCallback(() => {
		dispatch({ type: 'OPEN' });
	}, [dispatch]);

	const close = useCallback(() => {
		dispatch({ type: 'CLOSE' });
	}, [dispatch]);

	const setCategory = useCallback(
		(category: SettingsCategory) => {
			dispatch({ type: 'SET_CATEGORY', category });
		},
		[dispatch],
	);

	return { toggle, open, close, setCategory };
}
