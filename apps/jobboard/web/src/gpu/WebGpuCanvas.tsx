/// <reference types="@webgpu/types" />
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { EffectInit } from '@kbve/fx';
import { gradients } from '../ui/gradients';

// Browser WebGPU host for the @kbve effect system. Reuses EffectInit as-is; the
// only difference from the RN host is no context.present() (the browser
// presents on queue.submit). Renders a fixed full-viewport layer behind the
// app; falls back to a CSS gradient when WebGPU is unavailable.
export function WebGpuCanvas({
	effect,
	intensity = 0.55,
	accent = [0.79, 0.65, 0.42],
	style,
}: {
	effect: EffectInit;
	intensity?: number;
	accent?: readonly [number, number, number];
	style?: CSSProperties;
}) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const [unsupported, setUnsupported] = useState(false);

	useEffect(() => {
		const canvas = canvasRef.current;
		const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
		if (!canvas || !gpu) {
			setUnsupported(true);
			return;
		}

		let raf = 0;
		let disposed = false;
		let dispose: (() => void) | null = null;

		(async () => {
			const adapter = await gpu.requestAdapter();
			const device = await adapter?.requestDevice();
			if (!device || disposed) {
				setUnsupported(true);
				return;
			}
			const ctx = canvas.getContext('webgpu');
			if (!ctx) {
				setUnsupported(true);
				return;
			}
			const format = gpu.getPreferredCanvasFormat();
			ctx.configure({ device, format, alphaMode: 'premultiplied' });

			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const resize = () => {
				canvas.width = Math.max(
					1,
					Math.floor(canvas.clientWidth * dpr),
				);
				canvas.height = Math.max(
					1,
					Math.floor(canvas.clientHeight * dpr),
				);
			};
			resize();
			const ro = new ResizeObserver(resize);
			ro.observe(canvas);

			const runner = effect({ device, format });
			const start = performance.now();
			const loop = () => {
				try {
					const tex = ctx.getCurrentTexture();
					runner.frame({
						view: tex.createView(),
						timeMs: performance.now() - start,
						width: tex.width,
						height: tex.height,
						pointerX: 0.5,
						pointerY: 0.5,
						pointerDown: 0,
						intensity,
						accent,
					});
					raf = requestAnimationFrame(loop);
				} catch {
					// surface lost; stop quietly
				}
			};
			loop();
			dispose = () => {
				cancelAnimationFrame(raf);
				ro.disconnect();
				runner.dispose();
			};
		})();

		return () => {
			disposed = true;
			cancelAnimationFrame(raf);
			dispose?.();
		};
	}, [effect, intensity, accent]);

	const base: CSSProperties = {
		position: 'fixed',
		inset: 0,
		zIndex: 0,
		pointerEvents: 'none',
		...style,
	};

	if (unsupported) {
		return (
			<div
				style={{ ...base, opacity: 0.5, background: gradients.accent }}
			/>
		);
	}
	return <canvas ref={canvasRef} style={{ ...base, opacity: 0.5 }} />;
}
