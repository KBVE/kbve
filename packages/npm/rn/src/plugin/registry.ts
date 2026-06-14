import { Store } from '@kbve/core';
import type { Core, UpdateResult } from '@kbve/core';
import type { Capability } from './capability';
import { validateManifest } from './manifest';
import type { PluginManifest, PluginSurfaceSlot } from './manifest';

export type PluginStatus = 'installed' | 'enabled' | 'disabled' | 'error';

export interface InstalledPlugin {
	manifest: PluginManifest;
	status: PluginStatus;
	granted: Capability[];
	error?: string;
}

export interface PluginRegistryState {
	plugins: Record<string, InstalledPlugin>;
	order: string[];
}

export const initialRegistryState: PluginRegistryState = {
	plugins: {},
	order: [],
};

export type PluginRegistryEvent =
	| { type: 'install'; manifest: PluginManifest; grant?: Capability[] }
	| { type: 'enable'; id: string }
	| { type: 'disable'; id: string }
	| { type: 'remove'; id: string }
	| { type: 'grant'; id: string; capabilities: Capability[] }
	| { type: 'revoke'; id: string; capabilities: Capability[] }
	| { type: 'fail'; id: string; message: string };

export interface PluginRegistryView {
	all: InstalledPlugin[];
	enabled: InstalledPlugin[];
	bySurface: Record<PluginSurfaceSlot, InstalledPlugin[]>;
}

type RegistryEffect = never;

function intersectGrant(
	manifest: PluginManifest,
	requested: readonly Capability[],
): Capability[] {
	const allowed = new Set(manifest.permissions);
	const seen = new Set<Capability>();
	const out: Capability[] = [];
	for (const cap of requested) {
		if (allowed.has(cap) && !seen.has(cap)) {
			seen.add(cap);
			out.push(cap);
		}
	}
	return out;
}

function patch(
	state: PluginRegistryState,
	id: string,
	fn: (plugin: InstalledPlugin) => InstalledPlugin,
): PluginRegistryState {
	const existing = state.plugins[id];
	if (!existing) return state;
	return {
		...state,
		plugins: { ...state.plugins, [id]: fn(existing) },
	};
}

function reduce(
	state: PluginRegistryState,
	event: PluginRegistryEvent,
): PluginRegistryState {
	switch (event.type) {
		case 'install': {
			const errors = validateManifest(event.manifest);
			const id = event.manifest.id;
			const granted = intersectGrant(event.manifest, event.grant ?? []);
			const plugin: InstalledPlugin = {
				manifest: event.manifest,
				status: errors.length ? 'error' : 'installed',
				granted,
				error: errors.length ? errors.join('; ') : undefined,
			};
			return {
				plugins: { ...state.plugins, [id]: plugin },
				order: state.order.includes(id)
					? state.order
					: [...state.order, id],
			};
		}
		case 'enable':
			return patch(state, event.id, (p) =>
				p.status === 'error' ? p : { ...p, status: 'enabled' },
			);
		case 'disable':
			return patch(state, event.id, (p) =>
				p.status === 'error' ? p : { ...p, status: 'disabled' },
			);
		case 'remove': {
			if (!state.plugins[event.id]) return state;
			const next = { ...state.plugins };
			delete next[event.id];
			return {
				plugins: next,
				order: state.order.filter((id) => id !== event.id),
			};
		}
		case 'grant':
			return patch(state, event.id, (p) => ({
				...p,
				granted: intersectGrant(p.manifest, [
					...p.granted,
					...event.capabilities,
				]),
			}));
		case 'revoke':
			return patch(state, event.id, (p) => ({
				...p,
				granted: p.granted.filter(
					(cap) => !event.capabilities.includes(cap),
				),
			}));
		case 'fail':
			return patch(state, event.id, (p) => ({
				...p,
				status: 'error',
				error: event.message,
			}));
		default:
			return state;
	}
}

const EMPTY_SURFACES: Record<PluginSurfaceSlot, InstalledPlugin[]> = {
	sidebar: [],
	panel: [],
	modal: [],
	command: [],
	background: [],
};

function project(state: PluginRegistryState): PluginRegistryView {
	const all = state.order
		.map((id) => state.plugins[id])
		.filter((p): p is InstalledPlugin => Boolean(p));
	const enabled = all.filter((p) => p.status === 'enabled');
	const bySurface: Record<PluginSurfaceSlot, InstalledPlugin[]> = {
		sidebar: [],
		panel: [],
		modal: [],
		command: [],
		background: [],
	};
	for (const plugin of enabled) {
		for (const surface of plugin.manifest.surfaces) {
			bySurface[surface.slot].push(plugin);
		}
	}
	return { all, enabled, bySurface };
}

export const pluginRegistryCore: Core<
	PluginRegistryState,
	PluginRegistryEvent,
	PluginRegistryView,
	RegistryEffect
> = {
	initial: () => ({ ...initialRegistryState }),
	update: (
		state,
		event,
	): UpdateResult<PluginRegistryState, RegistryEffect> => ({
		state: reduce(state, event),
		effects: [],
	}),
	view: project,
};

export class PluginRegistry extends Store<
	PluginRegistryState,
	PluginRegistryEvent,
	PluginRegistryView,
	RegistryEffect
> {}

export function createPluginRegistry(): PluginRegistry {
	return new PluginRegistry(pluginRegistryCore);
}

export { EMPTY_SURFACES };
