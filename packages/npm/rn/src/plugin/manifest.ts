import type { Capability } from './capability';

export type PluginSurfaceSlot =
	| 'sidebar'
	| 'panel'
	| 'modal'
	| 'command'
	| 'canvas'
	| 'background';

export type PluginEntry =
	| { kind: 'inline-js'; source: string }
	| { kind: 'url-js'; url: string }
	| { kind: 'url-page'; url: string; injectBridge?: boolean }
	| { kind: 'wasm'; url: string; exportName?: string }
	| { kind: 'native'; componentId: string }
	| { kind: 'typegpu'; componentId: string; effectId: string };

export interface PluginSurface {
	slot: PluginSurfaceSlot;
	title: string;
	icon?: string;
}

export interface PluginManifest {
	id: string;
	name: string;
	version: string;
	description?: string;
	author?: string;
	entry: PluginEntry;
	permissions: readonly Capability[];
	surfaces: readonly PluginSurface[];
	allowedHosts?: readonly string[];
}

const ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)*$/;

export function validateManifest(manifest: PluginManifest): string[] {
	const errors: string[] = [];
	if (!ID_PATTERN.test(manifest.id)) {
		errors.push(`invalid id "${manifest.id}"`);
	}
	if (!manifest.name.trim()) {
		errors.push('name is empty');
	}
	if (!manifest.version.trim()) {
		errors.push('version is empty');
	}
	if (!manifest.surfaces.length) {
		errors.push('no surfaces declared');
	}
	if (manifest.entry.kind === 'wasm' && !manifest.entry.url) {
		errors.push('wasm entry missing url');
	}
	if (manifest.entry.kind === 'url-js' && !manifest.entry.url) {
		errors.push('url-js entry missing url');
	}
	if (manifest.entry.kind === 'url-page' && !manifest.entry.url) {
		errors.push('url-page entry missing url');
	}
	if (manifest.entry.kind === 'inline-js' && !manifest.entry.source.trim()) {
		errors.push('inline-js entry missing source');
	}
	if (manifest.entry.kind === 'typegpu') {
		if (!manifest.entry.componentId) {
			errors.push('typegpu entry missing componentId');
		}
		if (!manifest.entry.effectId) {
			errors.push('typegpu entry missing effectId');
		}
	}
	return errors;
}

export function isSandboxed(entry: PluginEntry): boolean {
	return entry.kind !== 'native' && entry.kind !== 'typegpu';
}

export function isHostedPage(entry: PluginEntry): boolean {
	return entry.kind === 'url-page';
}
