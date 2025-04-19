/// <reference lib="webworker" />

import type {
	WebWorkerCommand,
	WebWorkerResponse,
	WebRenderMessage,
	RenderType,
	RenderTypeOptionsMap,
	WebWorkerHandler,
} from 'src/env';

const canvasInstances = new Map<string, any>();

const handlers: {
	[K in WebWorkerCommand['type']]: WebWorkerHandler<Extract<WebWorkerCommand, { type: K }>>;
} = {
	render: handleRender,
	destroy: ({ id }) => handleDestroy(id),
};

// Type guard for OffscreenCanvas
function isOffscreenCanvas(obj: unknown): obj is OffscreenCanvas {
	return (
		typeof obj === 'object' &&
		!!obj &&
		'getContext' in obj &&
		'width' in obj &&
		'height' in obj
	);
}

async function handleRender<T extends RenderType>(msg: WebRenderMessage<T>) {
	const { id, renderType, canvas, src, options } = msg;

	if (!isOffscreenCanvas(canvas)) {
		throw new Error(`Expected OffscreenCanvas for renderType "${renderType}"`);
	}

	if (canvasInstances.has(id)) {
		canvasInstances.get(id)?.destroy?.();
		canvasInstances.delete(id);
	}

	switch (renderType) {
		case 'lottie': {
            if (typeof self.HTMLCanvasElement === 'undefined') {
                (self as any).HTMLCanvasElement = OffscreenCanvas;
            }
        
            const mod = await import(
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                'https://esm.sh/@lottiefiles/dotlottie-web'
            ) as any;
        
            const { DotLottie } = mod;
        
            if (!DotLottie) {
                throw new Error('DotLottie is not available in this environment.');
            }
        
            const instance = new DotLottie({
                canvas,
                src,
                loop: true,
                autoplay: true,
                mode: 'normal',
                ...options,
            });
        
            canvasInstances.set(id, instance);
            postSuccess('render_success', id);
            return;
        }
        

		case 'chart': {
			throw new Error('Chart rendering not yet implemented.');
		}

		case 'webgl': {
			throw new Error('WebGL rendering not yet implemented.');
		}

		case 'particles': {
			throw new Error('Particles rendering not yet implemented.');
		}

		case 'text': {
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('Failed to get 2D context for text rendering.');

			const textOptions = options as RenderTypeOptionsMap['text'];
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.font = `${textOptions.fontSize ?? 24}px sans-serif`;
			ctx.fillStyle = 'white';
			ctx.fillText(textOptions.content ?? '', 20, 60);

			postSuccess('render_success', id);
			return;
		}
	}

	throw new Error(`Render type "${renderType}" not yet supported.`);
}

async function handleDestroy(id: string) {
	const instance = canvasInstances.get(id);
	if (instance) {
		instance.destroy?.();
		canvasInstances.delete(id);
		postSuccess('destroy_success', id);
	} else {
		postError('destroy', id, `No canvas instance found for id: ${id}`);
	}
}

function postSuccess(type: WebWorkerResponse['type'], id: string) {
	self.postMessage({ type, id });
}

function postError(type: string, id: string, error: string) {
	self.postMessage({ type: `${type}_error`, id, error });
}

self.onmessage = async <T extends WebWorkerCommand>({ data }: MessageEvent<T>) => {
	const type = data.type as WebWorkerCommand['type'];
	try {
		const handler = handlers[type] as WebWorkerHandler<T>;
		await handler(data);
	} catch (err: any) {
		const id = (data as any).id ?? 'unknown';
		postError(type, id, err?.message ?? 'Unknown error');
	}
};
