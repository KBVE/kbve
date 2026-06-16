/// <reference types="@webgpu/types" />

export interface EffectContext {
	device: GPUDevice;
	format: GPUTextureFormat;
}

export interface FrameState {
	view: GPUTextureView;
	timeMs: number;
	width: number;
	height: number;
	pointerX: number;
	pointerY: number;
	pointerDown: number;
	intensity: number;
	accent: readonly [number, number, number];
}

export interface EffectRunner {
	frame(state: FrameState): void;
	dispose(): void;
}

export type EffectInit = (ctx: EffectContext) => EffectRunner;
