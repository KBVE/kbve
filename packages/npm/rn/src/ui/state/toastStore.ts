import { toasts } from '../../toasts';
import type { Toast, ToastTone } from '../../toasts';

export type { ToastTone };
export type ToastModel = Toast;

export const toastStore = {
	push: (message: string, tone?: ToastTone): string =>
		toasts.push({ message, tone }),
	dismiss: (id: string) => toasts.dismiss(id),
};
