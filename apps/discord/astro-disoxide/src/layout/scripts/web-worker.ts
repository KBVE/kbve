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

//  TODO: Add Guards*

async function handleRender<T extends RenderType>(msg: WebRenderMessage<T>) {
	const { id, renderType, canvas, src, options } = msg;

	if (canvasInstances.has(id)) {
		canvasInstances.get(id)?.destroy?.();
		canvasInstances.delete(id);
	}

	switch (renderType) {
		case 'lottie': {
			const { DotLottieWorker } = (await import(
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
		        // @ts-ignore: Remote CDN import doesn't have type declarations
				'https://esm.sh/@lottiefiles/dotlottie-web'
			)) as { DotLottieWorker: any };

			const instance = new DotLottieWorker({
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
			// TODO: Implement chart rendering logic here (e.g., using Chart.js in OffscreenCanvas)
			throw new Error('Chart rendering not yet implemented.');
		}

		case 'webgl': {
			// TODO: Compile shaders + draw with WebGL context from canvas
			throw new Error('WebGL rendering not yet implemented.');
		}

		case 'particles': {
			// TODO: Render particles via a lightweight engine (or wasm?)
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


// TODO: Add Guards*(mut, readonly)

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