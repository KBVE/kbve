export type ToastSeverity = 'info' | 'success' | 'warning' | 'error' | 'loot';

export interface Toast {
	id: string;
	message: string;
	severity: ToastSeverity;
	duration: number;
	createdAt: number;
	exiting: boolean;
}

export interface ToastConfig {
	maxVisible: number;
	defaultDuration: number;
}

export const DEFAULT_TOAST_CONFIG: ToastConfig = {
	maxVisible: 5,
	defaultDuration: 4000,
};

export const SEVERITY_DURATIONS: Record<ToastSeverity, number> = {
	info: 3000,
	success: 3000,
	warning: 5000,
	error: 6000,
	loot: 4000,
};

export const SEVERITY_BORDER_COLORS: Record<ToastSeverity, string> = {
	info: 'border-l-toast-info',
	success: 'border-l-toast-success',
	warning: 'border-l-toast-warning',
	error: 'border-l-toast-error',
	loot: 'border-l-toast-loot',
};
