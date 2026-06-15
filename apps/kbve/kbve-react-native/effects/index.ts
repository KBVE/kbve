import { gradientEffect } from './gradient';
import type { EffectInit } from './types';

const REGISTRY: Record<string, EffectInit> = {
	gradient: gradientEffect,
};

export function registerEffect(id: string, init: EffectInit): void {
	REGISTRY[id] = init;
}

export function getEffect(id: string): EffectInit | undefined {
	return REGISTRY[id];
}

export * from './types';
