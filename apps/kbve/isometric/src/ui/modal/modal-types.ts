import type { ReactNode } from 'react';

export interface ModalConfig {
	id: string;
	title: string;
	content: ReactNode;
	onClose?: () => void;
	closeOnOverlayClick?: boolean;
	closeOnEscape?: boolean;
	size?: 'sm' | 'md' | 'lg';
}

export interface ModalState {
	stack: ModalConfig[];
	isOpen: boolean;
}

export const MODAL_SIZE_CLASSES: Record<string, string> = {
	sm: 'max-w-sm',
	md: 'max-w-md',
	lg: 'max-w-lg',
};
