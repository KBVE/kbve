/// <reference types="@webgpu/types" />

export interface EffectContext {
	device: GPUDevice;
	format: GPUTextureFormat;
}

/// Per-frame inputs handed to an effect. Pointer is normalized [0,1] in the
/// canvas (matching `in.uv`); `pointerDown` is 0 or 1. `intensity` scales the
/// final color (applied automatically). `accent` is a host-provided rgb tint
/// (see the capability bridge in TypeGpuHost). Extend this struct (and the
/// Globals uniform in createEffect) to expose more inputs to shaders.
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

/// A registerable effect: stable id, human label, and its init function. The
/// registry and the FX switcher both derive from a list of these.
export interface EffectDefinition {
	id: string;
	label: string;
	init: EffectInit;
}
