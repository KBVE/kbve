import type { ReactNode } from 'react';

export interface ModalConfig {
	id: string;
	title: string;
	content: ReactNode;
	onClose?: () => void;
	closeOnOverlayClick?: boolean;
	closeOnEscape?: boolean;
	size?: 'xs' | 'sm' | 'md' | 'lg';
}

export interface ModalState {
	stack: ModalConfig[];
	isOpen: boolean;
}

export const MODAL_SIZE_CLASSES: Record<string, string> = {
	xs: 'max-w-xs',
	sm: 'max-w-sm',
	md: 'max-w-md',
	lg: 'max-w-lg',
};
