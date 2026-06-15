import { createEventBus } from './events';
import { createSignal } from './events';
import type { Signal } from './events';

export interface RequestOptions {
	method?: string;
	headers?: Record<string, string>;
	body?: unknown;
	timeoutMs?: number;
	retries?: number;
	retryDelayMs?: number;
	signal?: AbortSignal;
}

export interface RequestResult<T> {
	ok: boolean;
	status: number;
	data: T | null;
	error: string | null;
}

export const netEvents = createEventBus<{
	start: { url: string; method: string };
	success: { url: string; status: number };
	error: { url: string; error: string };
}>();

const sleep = (ms: number) =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return 'Request failed';
}

export async function request<T>(
	url: string,
	options: RequestOptions = {},
): Promise<RequestResult<T>> {
	const {
		method = 'GET',
		headers = {},
		body,
		timeoutMs = 15000,
		retries = 0,
		retryDelayMs = 300,
		signal,
	} = options;

	const isJsonBody = body !== undefined && typeof body !== 'string';
	const payload =
		body === undefined
			? undefined
			: isJsonBody
				? JSON.stringify(body)
				: (body as string);
	const finalHeaders = isJsonBody
		? { 'Content-Type': 'application/json', ...headers }
		: headers;

	netEvents.emit('start', { url, method });

	let lastError = 'Request failed';
	for (let attempt = 0; attempt <= retries; attempt++) {
		const controller = new AbortController();
		const onAbort = () => controller.abort();
		signal?.addEventListener('abort', onAbort);
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetch(url, {
				method,
				headers: finalHeaders,
				body: payload,
				signal: controller.signal,
			});
			clearTimeout(timer);
			signal?.removeEventListener('abort', onAbort);

			const text = await response.text();
			const data = text ? (JSON.parse(text) as T) : null;

			if (!response.ok) {
				const message =
					(data as { message?: string; error?: string } | null)
						?.message ??
					(data as { message?: string; error?: string } | null)
						?.error ??
					`HTTP ${response.status}`;
				if (response.status >= 500 && attempt < retries) {
					lastError = message;
					await sleep(retryDelayMs * (attempt + 1));
					continue;
				}
				netEvents.emit('error', { url, error: message });
				return {
					ok: false,
					status: response.status,
					data,
					error: message,
				};
			}

			netEvents.emit('success', { url, status: response.status });
			return { ok: true, status: response.status, data, error: null };
		} catch (error) {
			clearTimeout(timer);
			signal?.removeEventListener('abort', onAbort);
			lastError = signal?.aborted ? 'Cancelled' : errorMessage(error);
			if (signal?.aborted || attempt >= retries) break;
			await sleep(retryDelayMs * (attempt + 1));
		}
	}

	netEvents.emit('error', { url, error: lastError });
	return { ok: false, status: 0, data: null, error: lastError };
}

export type ResourceStatus = 'idle' | 'loading' | 'success' | 'error';

export interface ResourceState<T> {
	status: ResourceStatus;
	data: T | null;
	error: string | null;
}

export interface Resource<T> {
	state: Signal<ResourceState<T>>;
	load(): Promise<void>;
	refresh(): Promise<void>;
	cancel(): void;
}

export function createResource<T>(
	fetcher: (signal: AbortSignal) => Promise<T>,
): Resource<T> {
	const state = createSignal<ResourceState<T>>({
		status: 'idle',
		data: null,
		error: null,
	});
	let controller: AbortController | null = null;

	const run = async (): Promise<void> => {
		controller?.abort();
		const current = new AbortController();
		controller = current;
		state.set((prev) => ({ ...prev, status: 'loading', error: null }));
		try {
			const data = await fetcher(current.signal);
			if (current.signal.aborted) return;
			state.set({ status: 'success', data, error: null });
		} catch (error) {
			if (current.signal.aborted) return;
			state.set((prev) => ({
				status: 'error',
				data: prev.data,
				error: errorMessage(error),
			}));
		}
	};

	return {
		state,
		load: () =>
			state.peek().status === 'idle' ? run() : Promise.resolve(),
		refresh: run,
		cancel: () => controller?.abort(),
	};
}
