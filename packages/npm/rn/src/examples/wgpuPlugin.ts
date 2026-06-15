import type { PluginManifest } from '../plugin/manifest';

export const WGPU_COMPONENT_ID = 'kbve.wgpu';

export function createWgpuPlugin(
	componentId: string = WGPU_COMPONENT_ID,
): PluginManifest {
	return {
		id: 'kbve.wgpu',
		name: 'Native GPU Surface',
		version: '0.1.0',
		description:
			'Native wgpu (Metal/Vulkan) render surface mounted as a full-bleed canvas. Hosts the Bevy isometric game on device.',
		author: 'KBVE',
		entry: { kind: 'native', componentId },
		permissions: ['agent:read', 'notify'],
		surfaces: [{ slot: 'canvas', title: 'Game' }],
	};
}

export const wgpuPluginManifest: PluginManifest = createWgpuPlugin();
