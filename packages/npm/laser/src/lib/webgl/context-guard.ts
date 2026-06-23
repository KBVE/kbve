export type WebGLEventKind = 'lost' | 'restored' | 'unsupported';

export function isWebGLAvailable(): boolean {
	try {
		if (typeof window === 'undefined' || !window.WebGLRenderingContext) {
			return false;
		}
		const canvas = document.createElement('canvas');
		const gl = (canvas.getContext('webgl2') ||
			canvas.getContext('webgl')) as WebGLRenderingContext | null;
		if (!gl) return false;
		gl.getExtension('WEBGL_lose_context')?.loseContext();
		return true;
	} catch {
		return false;
	}
}

export function reportWebGLEvent(
	kind: WebGLEventKind,
	detail?: Record<string, unknown>,
): void {
	const payload = { kind, ...detail };
	if (kind === 'restored') {
		console.info('[laser/webgl] context restored', payload);
	} else {
		console.warn(`[laser/webgl] context ${kind}`, payload);
	}
	try {
		window.dispatchEvent(
			new CustomEvent('kbve:webgl', { detail: payload }),
		);
	} catch {
		/* best-effort telemetry */
	}
}

export interface ContextGuardHandlers {
	onLost: () => void;
	onRestored: () => void;
}

export function installWebGLContextGuard(
	canvas: HTMLCanvasElement,
	{ onLost, onRestored }: ContextGuardHandlers,
): () => void {
	const lost = (e: Event) => {
		e.preventDefault();
		reportWebGLEvent('lost');
		onLost();
	};
	const restored = () => {
		reportWebGLEvent('restored');
		onRestored();
	};
	canvas.addEventListener('webglcontextlost', lost, false);
	canvas.addEventListener('webglcontextrestored', restored, false);
	return () => {
		canvas.removeEventListener('webglcontextlost', lost);
		canvas.removeEventListener('webglcontextrestored', restored);
	};
}
