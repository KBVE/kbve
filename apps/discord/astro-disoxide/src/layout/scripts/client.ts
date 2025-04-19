import type {
	CommandPayload,
	SharedWorkerCommand,
	RenderType,
	RenderTypeOptionsMap,
	WebWorkerCommand, WebWorkerResponse
} from 'src/env';
const EXPECTED_SW_VERSION = '1.0.2';

let sharedPort: MessagePort | null = null;
let webWorker: Worker | null = null;

// * Memoizing

const activeLottieInstances = new Map<string, any>();


// * Listeners

type MessageListenerMap = Map<
	string,
	{ resolve: (data: any) => void; reject: (err: any) => void }
>;

function createMessageHandler(
	listenerMap: MessageListenerMap,
	label = 'Worker',
): (event: MessageEvent) => void {
	return (e: MessageEvent) => {
		const { type, id, error, payload, requestId } = e.data;

		const finalId = id ?? requestId;
		if (!finalId || !listenerMap.has(finalId)) {
			console.warn(`[${label}] Unknown requestId:`, finalId);
			return;
		}

		const { resolve, reject } = listenerMap.get(finalId)!;
		listenerMap.delete(finalId);

		error ? reject(error) : resolve(payload ?? e.data);
	};
}

const sharedListeners: MessageListenerMap = new Map();
const webListeners: MessageListenerMap = new Map();

// * Web Worker

function initWebWorker(): Worker {
	if (!webWorker) {
		webWorker = new Worker(new URL('./web-worker', import.meta.url), { type: 'module' });
		webWorker.onmessage = createMessageHandler(webListeners, 'WebWorker');
		webWorker.onerror = (e) => {
			console.error('[WebWorker] Error:', e);
		};
	}
	return webWorker;
}
function useWebWorkerCall<T = any>(
	msg: WebWorkerCommand,
	timeoutMs = 10000,
	transferables: Transferable[] = [],
): Promise<T> {
	return new Promise((resolve, reject) => {
		const id = (msg as any).id ?? crypto.randomUUID();
		(msg as any).id = id;

		const timeout = setTimeout(() => {
			webListeners.delete(id);
			reject(new Error(`WebWorker request timed out: ${msg.type}`));
		}, timeoutMs);

		webListeners.set(id, {
			resolve: (data: T) => {
				clearTimeout(timeout);
				webListeners.delete(id);
				resolve(data);
			},
			reject: (err: any) => {
				clearTimeout(timeout);
				webListeners.delete(id);
				reject(err);
			},
		});

		initWebWorker().postMessage(msg, transferables);
	});
}



//	* UI Canvas

export function createCanvasId(renderType: RenderType): string {
	return `${renderType}-${crypto.randomUUID()}`;
}

export async function initCanvasWorker<T extends RenderType>(
	idOrCanvas: string | HTMLCanvasElement,
	canvasOrRenderType: HTMLCanvasElement | T,
	renderTypeOrSrc?: T | string,
	srcOrOptions?: string | RenderTypeOptionsMap[T],
	optionsMaybe?: RenderTypeOptionsMap[T],
): Promise<string> {
	let id: string;
	let canvas: HTMLCanvasElement;
	let renderType: T;
	let src: string | undefined;
	let options: RenderTypeOptionsMap[T] | undefined;

	if (typeof idOrCanvas === 'string') {
		id = idOrCanvas;
		canvas = canvasOrRenderType as HTMLCanvasElement;
		renderType = renderTypeOrSrc as T;
		src = srcOrOptions as string | undefined;
		options = optionsMaybe;
	} else {
		canvas = idOrCanvas;
		renderType = canvasOrRenderType as T;
		id = createCanvasId(renderType);
		src = renderTypeOrSrc as string | undefined;
		options = srcOrOptions as RenderTypeOptionsMap[T];
	}

	// ? Shortcut Lottie to main thread
	if (renderType === 'lottie') {
		if (activeLottieInstances.has(id)) {
			console.warn(`[Lottie] Instance for ${id} already exists`);
			return id;
		}

		const { DotLottieWorker } = await import(
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			'https://esm.sh/@lottiefiles/dotlottie-web'
		) as { DotLottieWorker: any };

		const instance = new DotLottieWorker({
			canvas,
			src,
			loop: true,
			autoplay: true,
			mode: 'normal',
			...options,
		});

		activeLottieInstances.set(id, instance);
		return id;
	}

	// ! Only call this if not lottie
	let offscreen: OffscreenCanvas;
	try {
		offscreen = canvas.transferControlToOffscreen();
	} catch (err) {
		throw new Error(`[Offscreen] Failed to transfer canvas "${id}": ${err}`);
	}
	
	await useWebWorkerCall(
		{
			type: 'render',
			id,
			renderType,
			canvas: offscreen,
			src,
			options,
		},
		10000,
		[offscreen],
	);

	return id;
}


export function destroyCanvasWorker(id: string): Promise<void> {
	if (!id) return Promise.reject(new Error('Missing canvas ID for destroy'));

	if (id.startsWith('lottie')) {
		activeLottieInstances.get(id)?.destroy?.();
		activeLottieInstances.delete(id);
		return Promise.resolve();
	}

	return useWebWorkerCall({ type: 'destroy', id });
}

export function initSharedWorker(): MessagePort {
	if (!sharedPort) {
		const worker = new SharedWorker(new URL('./shared-worker', import.meta.url));
		sharedPort = worker.port;
		sharedPort.start();

		sharedPort.onmessage = createMessageHandler(sharedListeners, 'SharedWorker');
		sharedPort.onmessageerror = (e) => {
			console.error('[SharedWorker] Message error:', e);
		};
	}
	return sharedPort;
}

export function useSharedWorkerCall<T = any>(
	type: string,
	payload: any = {},
	timeoutMs = 10000,
	transferables: Transferable[] = [],
): Promise<T> {
	return new Promise((resolve, reject) => {
		const requestId = crypto.randomUUID();
		const port = initSharedWorker();

		const timeout = setTimeout(() => {
			sharedListeners.delete(requestId);
			reject(new Error(`Request timed out: ${type}`));
		}, timeoutMs);

		sharedListeners.set(requestId, {
			resolve: (data: T) => {
				clearTimeout(timeout);
				sharedListeners.delete(requestId);
				resolve(data);
			},
			reject: (err: any) => {
				clearTimeout(timeout);
				sharedListeners.delete(requestId);
				reject(err);
			},
		});

		port.postMessage({ type, payload, requestId }, transferables);
	});
}


export function subscribeToTopic<T = any>(
	topic: string,
	onMessage: (payload: T) => void,
): () => void {
	const port = initSharedWorker();

	const handler = (e: MessageEvent) => {
		if (e.data.topic === topic) {
			onMessage(e.data.payload);
		}
	};

	port.addEventListener('message', handler);
	port.postMessage({ type: 'subscribe', topic });

	return () => {
		port.postMessage({ type: 'unsubscribe', topic });
		port.removeEventListener('message', handler);
	};
}

export async function registerServiceWorker() {
	if ('serviceWorker' in navigator) {
		try {
			const reg = await navigator.serviceWorker.register('/sw.js');
			console.log('[SharedWorker-Controlled] Service Worker registered');

			if (reg.active) {
				reg.active.postMessage({
					type: 'check-version',
					expectedVersion: EXPECTED_SW_VERSION,
				});

				setInterval(() => {
					reg.active?.postMessage({ type: 'ping' });
				}, 60_000);
			} else {
				console.warn(
					'[SW] Active service worker too old or missing — forcing cleanup',
				);
			}

			navigator.serviceWorker.addEventListener('message', (event) => {
				if (event.data?.type === 'pong') {
					console.log(
						'[SW] Pong received — version:',
						event.data.swVersion,
					);
				}
			});

			return reg;
		} catch (err) {
			console.error('[SW] Registration failed:', err);
		}
	}
}

export function dispatchCommand<T extends SharedWorkerCommand['type']>(
	type: T,
	payload: CommandPayload<T>,
	transferables: Transferable[] = [],
): Promise<any> {
	return useSharedWorkerCall(
		type,
		{ type, ...payload },
		10000,
		transferables,
	);
}

const customEventTarget = new EventTarget();

export function emitCustomEvent(name: string, detail?: any) {
	customEventTarget.dispatchEvent(new CustomEvent(name, { detail }));
}

export function onCustomEvent<T = any>(
	name: string,
	handler: (e: CustomEvent<T>) => void,
): () => void {
	const wrapped = (e: Event) => handler(e as CustomEvent<T>);
	customEventTarget.addEventListener(name, wrapped);
	return () => customEventTarget.removeEventListener(name, wrapped);
}


// ? Enclosed Functions

export async function registerWorkers(): Promise<void> {
	if (typeof window === 'undefined') return;

	try {
		await registerServiceWorker();
		initWebWorker();
		console.log('[Worker Init] All workers registered');
	} catch (err) {
		console.error('[Worker Init] Failed to initialize workers:', err);
	}
}