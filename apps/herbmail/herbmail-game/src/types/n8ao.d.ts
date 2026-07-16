declare module 'n8ao' {
	import type { Camera, Color, Scene } from 'three';
	import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';

	export interface N8AOConfiguration {
		aoRadius: number;
		distanceFalloff: number;
		intensity: number;
		color: Color;
		aoSamples: number;
		denoiseSamples: number;
		denoiseRadius: number;
		halfRes: boolean;
		depthAwareUpsampling: boolean;
		screenSpaceRadius: boolean;
		renderMode: number;
		gammaCorrection: boolean;
	}

	export class N8AOPass extends Pass {
		constructor(
			scene: Scene,
			camera: Camera,
			width?: number,
			height?: number,
		);
		configuration: N8AOConfiguration;
		setQualityMode(
			mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra',
		): void;
		setSize(width: number, height: number): void;
		dispose(): void;
	}
}
