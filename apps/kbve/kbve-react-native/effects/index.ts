import { aurora } from './aurora';
import { gradient } from './gradient';
import { plasma } from './plasma';
import { ripple } from './ripple';
import { starfield } from './starfield';
import type { EffectDefinition, EffectInit } from './types';

const EFFECTS: EffectDefinition[] = [
	aurora,
	gradient,
	plasma,
	ripple,
	starfield,
];

const BY_ID = new Map(EFFECTS.map((e) => [e.id, e]));

/// Register an effect at runtime (e.g. a plugin-provided one).
export function registerEffect(definition: EffectDefinition): void {
	BY_ID.set(definition.id, definition);
}

export function getEffect(id: string): EffectInit | undefined {
	return BY_ID.get(id)?.init;
}

/// Lightweight metadata for UI (switchers, menus) — no GPU init pulled in.
export function listEffects(): { id: string; label: string }[] {
	return [...BY_ID.values()].map(({ id, label }) => ({ id, label }));
}

export { createEffect } from './createEffect';
export * from './types';
