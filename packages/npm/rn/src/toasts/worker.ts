import { toasts as defaultQueue, ToastQueue } from './queue';
import type { ToastInput, ToastTone } from './types';
import type { PoolResponse } from '../worker/types';

export interface SerializableToastInput {
	message: string;
	tone?: ToastTone;
	priority?: number;
	durationMs?: number;
	dedupeKey?: string;
	meta?: Record<string, unknown>;
}

interface ToastEnvelope {
	__kbveToast: true;
	input: SerializableToastInput;
}

type PostMessage = (message: unknown) => void;

interface MessageTarget {
	addEventListener(
		type: 'message',
		listener: (event: { data: unknown }) => void,
	): void;
	removeEventListener(
		type: 'message',
		listener: (event: { data: unknown }) => void,
	): void;
}

function isEnvelope(value: unknown): value is ToastEnvelope {
	return (
		typeof value === 'object' &&
		value !== null &&
		(value as { __kbveToast?: unknown }).__kbveToast === true
	);
}

const workerPost: PostMessage = (message) => {
	(globalThis as { postMessage?: PostMessage }).postMessage?.(message);
};

export function emitToastFromWorker(
	input: SerializableToastInput,
	post: PostMessage = workerPost,
): void {
	post({ __kbveToast: true, input } satisfies ToastEnvelope);
}

export function connectWorkerToasts(
	target: MessageTarget,
	queue: ToastQueue = defaultQueue,
): () => void {
	const listener = (event: { data: unknown }) => {
		if (isEnvelope(event.data)) {
			queue.push(event.data.input as ToastInput);
		}
	};
	target.addEventListener('message', listener);
	return () => target.removeEventListener('message', listener);
}

export function toastPoolError<T>(
	res: PoolResponse<T>,
	message?: (res: PoolResponse<T>) => string,
	queue: ToastQueue = defaultQueue,
): PoolResponse<T> {
	if (!res.ok) {
		queue.push({
			message: message ? message(res) : (res.error ?? 'Request failed'),
			tone: 'danger',
			dedupeKey: `pool-${res.status}`,
		});
	}
	return res;
}
