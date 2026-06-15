/// <reference types="@webgpu/types" />

export interface EffectContext {
	device: GPUDevice;
	format: GPUTextureFormat;
}

export interface EffectRunner {
	frame(view: GPUTextureView, timeMs: number): void;
	dispose(): void;
}

export type EffectInit = (ctx: EffectContext) => EffectRunner;
