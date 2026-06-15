import { createPluginRegistry, createTypeGpuPlugin } from '@kbve/rn';
import type { PluginRegistry, PluginSurfaceSlot } from '@kbve/rn';
import './TypeGpuHost';

export interface FxEffectMeta {
	id: string;
	label: string;
}

/// Single source of truth for the TypeGPU effects available app-wide. The
/// native host ('kbve.typegpu') is registered once via the side-effect import.
export const FX_EFFECTS: FxEffectMeta[] = [
	{ id: 'aurora', label: 'Aurora' },
	{ id: 'gradient', label: 'Gradient' },
];

/// Build a one-effect registry, installed/enabled with `ui:render` granted,
/// mounted at the given surface slot. Switcher uses 'canvas'; the app-wide
/// ambient layer uses 'background'.
export function makeEffectRegistry(
	effectId: string,
	slot: PluginSurfaceSlot,
): PluginRegistry {
	const manifest = createTypeGpuPlugin(effectId, slot);
	const registry = createPluginRegistry();
	registry.dispatch({ type: 'install', manifest, grant: ['ui:render'] });
	registry.dispatch({ type: 'enable', id: manifest.id });
	return registry;
}
