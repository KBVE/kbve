import type { PluginManifest } from '../plugin/manifest';

export const ISOMETRIC_DEFAULT_URL = 'http://localhost:8787/';

export function createIsometricPlugin(
	url: string = ISOMETRIC_DEFAULT_URL,
): PluginManifest {
	const host = (() => {
		try {
			return new URL(url).host;
		} catch {
			return '';
		}
	})();
	return {
		id: 'kbve.isometric',
		name: 'Isometric Game',
		version: '0.0.1',
		description:
			'Bevy/wgpu isometric game (wasm) loaded as a full-bleed canvas micro-app.',
		author: 'KBVE',
		entry: { kind: 'url-page', url, injectBridge: true },
		permissions: ['agent:read', 'notify'],
		surfaces: [{ slot: 'canvas', title: 'Isometric' }],
		allowedHosts: host ? [host] : undefined,
	};
}

export const isometricPluginManifest: PluginManifest = createIsometricPlugin();
