/// <reference types="@webgpu/types" />

export interface EffectContext {
	device: GPUDevice;
	format: GPUTextureFormat;
}

export interface EffectRunner {
	frame(
		view: GPUTextureView,
		timeMs: number,
		width: number,
		height: number,
	): void;
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
