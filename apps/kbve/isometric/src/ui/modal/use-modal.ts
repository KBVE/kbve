import { useContext, useCallback } from 'react';
import { ModalDispatchContext } from './modal-context';
import type { ModalConfig } from './modal-types';

export function useModal() {
	const dispatch = useContext(ModalDispatchContext);

	const open = useCallback(
		(config: Omit<ModalConfig, 'id'> & { id?: string }) => {
			dispatch({
				type: 'OPEN',
				modal: {
					id: config.id ?? crypto.randomUUID(),
					closeOnOverlayClick: true,
					closeOnEscape: true,
					size: 'md',
					...config,
				},
			});
		},
		[dispatch],
	);

	const close = useCallback(() => {
		dispatch({ type: 'CLOSE' });
	}, [dispatch]);

	const closeAll = useCallback(() => {
		dispatch({ type: 'CLOSE_ALL' });
	}, [dispatch]);

	return { open, close, closeAll };
}
