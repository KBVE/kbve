import { useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { $modalId, openModal, closeModal } from '@kbve/droid';

export function useModal() {
	const modalId = useStore($modalId);

	const isOpen = useCallback((id: string) => modalId === id, [modalId]);
	const open = useCallback((id: string) => openModal(id), []);
	const close = useCallback((id?: string) => closeModal(id), []);

	return { modalId, isOpen, open, close };
}
